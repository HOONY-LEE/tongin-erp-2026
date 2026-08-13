/**
 * 현장용 서비스워커.
 *
 * 목표는 "신호가 끊겨도 오늘 작업과 작업지시서를 열어볼 수 있다"까지다.
 * 쓰기(작업 시작·완료)는 큐잉하지 않는다 — 완료 여부가 정산·고객 알림으로
 * 이어지므로, 실제로 서버에 반영됐는지 확실하지 않은 상태를 만들지 않는다.
 */
const SHELL = 'tongin-field-shell-v3';
const DATA = 'tongin-field-data-v3';

// 앱 껍데기 — 오프라인에서도 화면 자체는 뜨도록
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const isFieldRead = (url, method) =>
  method === 'GET' && url.pathname.startsWith('/api/field/work-orders');

const isFieldList = (url) => url.pathname === '/api/field/work-orders';

/**
 * 목록을 받을 때 각 작업지시서까지 미리 받아 둔다.
 * 현장은 "출발 전에 목록을 열고, 도착해서 상세를 여는" 흐름이라
 * 목록만 캐시해서는 정작 필요한 순간에 못 연다.
 */
async function prefetchDetails(listResponse, request) {
  let rows;
  try {
    rows = await listResponse.clone().json();
  } catch {
    return;
  }
  if (!Array.isArray(rows)) return;
  const cache = await caches.open(DATA);
  // 인증 헤더를 그대로 물려받아야 서버가 받아준다
  const headers = new Headers(request.headers);
  await Promise.all(
    rows.slice(0, 50).map(async (row) => {
      if (!row || !row.id) return;
      const detailUrl = new URL(`/api/field/work-orders/${row.id}`, self.location.origin);
      try {
        const res = await fetch(new Request(detailUrl, { headers }));
        if (res.ok) await cache.put(detailUrl.toString(), res.clone());
      } catch {
        // 한 건 실패가 나머지를 막지 않게 — 다음 온라인 때 다시 시도된다
      }
    }),
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 현장 조회 API — network-first: 온라인이면 최신, 끊기면 마지막으로 받은 값
  if (isFieldRead(url, request.method)) {
    const fallback = () =>
      caches.match(request).then(
        (hit) =>
          hit ??
          new Response(JSON.stringify({ message: '오프라인입니다. 받아둔 작업이 없습니다.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      );
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(request, copy));
            // 목록을 받았으면 각 작업지시서도 백그라운드로 받아 둔다
            if (isFieldList(url)) event.waitUntil(prefetchDetails(res, request));
            return res;
          }
          // 서버 장애·게이트웨이 오류도 현장에선 "안 열린다"는 점에서 오프라인과 같다.
          // 인증 실패(401/403)는 캐시로 가리면 안 되므로 그대로 전달한다.
          if (res.status >= 500) return fallback();
          return res;
        })
        .catch(fallback),
    );
    return;
  }

  // 그 외 API(쓰기 포함)는 캐시하지 않는다 — 오래된 값이나 유령 성공을 만들지 않기 위해
  if (url.pathname.startsWith('/api/')) return;

  // 화면 이동은 index.html로 (SPA) — 오프라인에서도 라우팅이 살아있게
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // 정적 자원 — cache-first
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'font' || request.destination === 'image')) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
