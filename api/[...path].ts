/**
 * Vercel 엣지 함수 — /api/* 를 실제 백엔드(API_ORIGIN)로 넘기는 프록시.
 *
 * 이 파일이 저장소 루트의 api/ 에 있는 이유: Vercel은 프로젝트 루트의 api/ 만
 * 서버리스 함수로 인식한다(모노레포라 프로젝트 루트 = 저장소 루트).
 * 백엔드 코드는 apps/api 에 있다.
 *
 * 웹과 API를 같은 도메인으로 맞추기 위한 것. 덕분에
 *  - CORS 설정이 필요 없고
 *  - 현장 서비스워커의 동일출처 캐시가 그대로 동작하며
 *  - 백엔드 호스트가 바뀌어도 재배포 없이 환경변수만 고치면 된다.
 */
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const origin = process.env.API_ORIGIN;
  if (!origin) {
    return new Response(
      JSON.stringify({ message: 'API 서버가 아직 연결되지 않았습니다. (API_ORIGIN 미설정)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const incoming = new URL(req.url);
  const target = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers(req.headers);
  headers.delete('host'); // 업스트림이 자기 호스트 기준으로 판단하도록

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // 본문을 스트림 그대로 넘길 때 필요
    ...(hasBody ? { duplex: 'half' } : {}),
    redirect: 'manual',
  } as RequestInit);

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}
