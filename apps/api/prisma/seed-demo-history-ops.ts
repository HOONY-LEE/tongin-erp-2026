/**
 * 시드(추가, 한 번만) — 2025-01-01부터 오늘까지 '운영 쪽 지난 기록'을 만든다. 위젯 스튜디오에서 비어 있던
 * 일정·청구(거래처)·상담 문자·공간 예약·리빙케어 주문·자재 발주·자재 입출고 차트가 의미 있게 보이도록. 시연용이다.
 *
 *   pnpm --filter @tongin/api demo:seed:history-ops     # 만들기(이미 있으면 건너뛴다)
 *   pnpm --filter @tongin/api demo:clear:history-ops    # 지우기(실운영 전환 때)
 *
 * - 일정 1천5백여 건: 지점·부서 공유 일정이 대부분(약 80%), 개인 일정은 일부. 회의·교육·점검·박람회·연차 등
 * - 청구: 전속 계약사(임직원 이사) 월별 청구 + 기업이전 건별 청구. 지난 건은 대부분 수금 완료, 일부 연체·부분 수금
 * - 상담 문자: 고객관리부·지점이 보낸 안내 문자 기록(실제로 보내지 않는다 — 행만 넣는다). 성공률 96~97%
 * - 공간 예약: 본사 회의실(평일 회의) · 파티룸(외부 대여, 주말 많음). 겹치지 않게, 일부 취소
 * - 리빙케어 주문: 입주청소·정리수납(이사 성수기)·에어컨 세척(초여름)·새집증후군(입주철)
 * - 자재 발주 → 본사 출고(OUT 전표) · 재고가 안전재고 밑으로 내려가면 입고(IN) · 월말 실사 조정(ADJUST)
 *
 * 표시: id가 'd0d01025-5eed-'로 시작한다(clear-demo-history-ops.ts). 번호가 있는 청구·주문·발주는 옛 번호가 'HO-'.
 * 화면 번호는 앱과 같은 규칙(next_doc_no)으로 그날 날짜에 붙는다. 같은 난수 씨앗이라 지우고 다시 돌리면 결과가 같다.
 * 고객 이름·전화는 seed-demo-history.ts의 가상 고객(010-009x-xxxx)을 쓰고, 파티룸 대여 고객도 같은 번호대의 가상 인물.
 *
 * seed-demo.ts(지점·직원)·seed-demo-catalog.ts(자재)·seed-demo-services.ts(리빙케어 상품)·seed-demo-history.ts(고객)를
 * 먼저 돌려야 한다 — 없으면 그 데이터셋만 건너뛴다.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { OPS_ID_PREFIX, OPS_MARK, hasDemoHistoryOps } from './clear-demo-history-ops';

const prisma = new PrismaClient();

// ── 날짜 — 하루를 '1970-01-01부터 며칠째(한국 날짜)'인 정수로 다룬다(seed-demo-history.ts와 같은 규칙) ──
const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1) / DAY;
const NOW = Date.now();
const TODAY = Math.floor((NOW + 9 * 3600_000) / DAY);
const dateOf = (dn: number) => new Date(dn * DAY);
/** 한국 시각 h:m의 순간 */
const ts = (dn: number, h: number, m = 0) => new Date(dn * DAY + (h - 9) * 3600_000 + m * 60_000);
const ymd = (dn: number) => dateOf(dn).toISOString().slice(0, 10);
const ymOf = (dn: number) => {
  const d = dateOf(dn);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
};
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const dnOf = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY;
const isWeekend = (dn: number) => {
  const w = ymOf(dn).w;
  return w === 0 || w === 6;
};
/** 다음 평일(그날이 평일이면 그날) */
const weekdayOnOrAfter = (dn: number) => {
  while (isWeekend(dn)) dn++;
  return dn;
};
const hhmm = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

// ── 난수(씨앗 고정) ──
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20251124);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;
function pick<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) < 0) return v;
  return items[items.length - 1][0];
}
const one = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
function poisson(lambda: number) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}
function hash01(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
const round = (n: number, unit: number) => Math.max(unit, Math.round(n / unit) * unit);

// ── 표시 id — 'd0d01025-5eed-<표 2자리><순번 2자리>-8<순번 3자리>-<순번 12자리>' ──
const idSeq: Record<string, number> = {};
const TABLE_CODE: Record<string, string> = {
  cal: '01',
  inv: '02',
  rcp: '03',
  sms: '04',
  spc: '05',
  svc: '06',
  mo: '07',
  mol: '08',
  stk: '09',
};
function oid(table: keyof typeof TABLE_CODE) {
  const n = (idSeq[table] = (idSeq[table] ?? 0) + 1);
  const hex = n.toString(16).padStart(12, '0');
  return `${OPS_ID_PREFIX}-${TABLE_CODE[table]}00-8000-${hex}`;
}
const mark = (p: string, n: number) => `${OPS_MARK}${p}${String(n).padStart(5, '0')}`;

// ── 계절 — 이사 성수기(2~3월·8~9월) ──
const MONTH_FACTOR = [0.78, 1.2, 1.42, 1.02, 0.95, 0.84, 0.88, 1.18, 1.38, 1.04, 0.9, 0.74];
function season(dn: number) {
  const { y, m, d } = ymOf(dn);
  const len = lastDayOfMonth(y, m);
  const pos = (d - 0.5) / len - 0.5;
  const other = (m + (pos < 0 ? 11 : 1)) % 12;
  const t = Math.abs(pos);
  return MONTH_FACTOR[m] * (1 - t) + MONTH_FACTOR[other] * t;
}
/** 2026년은 조금 늘어난다 */
const growth = (dn: number) => 1 + 0.12 * ((dn - START) / Math.max(1, TODAY - START));

// ── 가상 인물(파티룸 대여 고객) — seed-demo-history.ts와 같은 표 ──
const FAMILY = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남'.split('');
const GIVEN = (
  '민준 서연 도윤 하은 지호 수아 예준 지유 시우 서윤 주원 하린 지훈 채원 건우 다은 우진 예린 현우 소율 ' +
  '태윤 유나 성민 가은 준혁 지민 승현 수빈 은우 나연 재원 서진 동현 하윤 민서 영호 미경 정훈 혜진 상철'
).split(' ');
/** 010-009x-xxxx(가운데가 0으로 시작 — 실제로 쓰이지 않는 번호대). 고객 시드와 겹치지 않게 9만번대 */
const fakePhone = (n: number) => `010009${String(90_000 + (n % 10_000)).padStart(5, '0')}`;

type Emp = { id: string; name: string; orgUnitId: string; userId: string };

async function main() {
  const t0 = Date.now();
  if (TODAY <= START) throw new Error('오늘이 2025-01-01보다 앞 — 만들 기간이 없다');
  if (await hasDemoHistoryOps(prisma)) {
    console.log('[demo-history-ops] 이미 있다 — 건너뜀(다시 만들려면 먼저 demo:clear:history-ops)');
    return;
  }

  // ── 참조 ──
  const users = await prisma.appUser.findMany({
    where: {
      isActive: true,
      principalType: 'HUMAN',
      isExternal: false,
      employee: { isActive: true, orgUnit: { isActive: true } },
    },
    select: {
      id: true,
      employee: {
        select: {
          id: true,
          name: true,
          orgUnitId: true,
          orgUnit: { select: { type: true, name: true } },
        },
      },
    },
    orderBy: { loginId: 'asc' },
  });
  const emps: (Emp & { orgType: string; orgName: string })[] = users
    .filter((u) => u.employee)
    .map((u) => ({
      id: u.employee!.id,
      name: u.employee!.name,
      orgUnitId: u.employee!.orgUnitId,
      userId: u.id,
      orgType: u.employee!.orgUnit.type,
      orgName: u.employee!.orgUnit.name,
    }));
  if (!emps.length) {
    console.error(
      '계정이 있는 직원이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다',
    );
    process.exit(1);
  }
  const branchEmps = emps.filter((e) => e.orgType === 'BRANCH');
  const hqEmps = emps.filter((e) => e.orgType !== 'BRANCH');
  const byOrg = new Map<string, Emp[]>();
  for (const e of emps) {
    if (!byOrg.has(e.orgUnitId)) byOrg.set(e.orgUnitId, []);
    byOrg.get(e.orgUnitId)!.push(e);
  }
  const branches = [...new Set(branchEmps.map((e) => e.orgUnitId))].map((id) => ({
    id,
    // 지점마다 바쁜 정도가 다르다(0.4~1.6)
    w: 0.4 + 1.2 * hash01(id),
    emps: byOrg.get(id)!,
  }));
  const branchPick = branches.map((b) => [b, b.w] as const);
  const csEmps = hqEmps.filter((e) => /고객관리|홈플래너/.test(e.orgName));
  const mgmtEmps = hqEmps.filter((e) => /경영관리|본사/.test(e.orgName));
  const hqPool = hqEmps.length ? hqEmps : emps;

  // 가상 고객(seed-demo-history.ts) — 없으면 다른 가상 고객
  let customers = await prisma.customer.findMany({
    where: { legacyNo: { startsWith: 'HS-' }, phonePrimary: { not: null } },
    select: {
      id: true,
      name: true,
      phonePrimary: true,
      addr: true,
      addrDetail: true,
      ownerOrgId: true,
    },
    orderBy: { legacyNo: 'asc' },
  });
  if (!customers.length)
    customers = await prisma.customer.findMany({
      where: { phonePrimary: { startsWith: '010009' } },
      select: {
        id: true,
        name: true,
        phonePrimary: true,
        addr: true,
        addrDetail: true,
        ownerOrgId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 3000,
    });
  const custByOrg = new Map<string, typeof customers>();
  for (const c of customers) {
    if (!c.ownerOrgId) continue;
    if (!custByOrg.has(c.ownerOrgId)) custByOrg.set(c.ownerOrgId, []);
    custByOrg.get(c.ownerOrgId)!.push(c);
  }
  const customerOf = (orgId?: string) => {
    const local = orgId ? custByOrg.get(orgId) : undefined;
    return local?.length && chance(0.8) ? one(local) : customers.length ? one(customers) : null;
  };

  // ════════════════ 1. 일정 ════════════════
  type Cal = Prisma.CalendarEventCreateManyInput;
  const events: Cal[] = [];
  const COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55'];
  const BRANCH_ORG: [string, string, number, number][] = [
    // 제목, 장소, 시간(시간 단위), 가중치
    ['주간 지점 회의', '지점 사무실', 1, 30],
    ['기사 안전 교육', '지점 사무실', 2, 8],
    ['차량 정기 점검', '정비소', 3, 8],
    ['포장재 재고 점검', '지점 창고', 1, 8],
    ['방문 견적 동행', '고객 댁', 2, 14],
    ['신입 기사 현장 교육', '현장', 4, 5],
    ['월간 실적 점검', '지점 사무실', 1, 10],
    ['가맹점 간담회', '본사 회의실', 2, 4],
    ['보관 창고 정리', '보관 창고', 3, 4],
  ];
  const HQ_ORG: [string, string, number, number][] = [
    ['주간 경영회의', '본사 회의실', 1, 20],
    ['마케팅 캠페인 리뷰', '본사 회의실', 1, 10],
    ['전속 계약사 미팅', '거래처', 2, 10],
    ['CS 품질 회의', '본사 회의실', 1, 12],
    ['지점장 화상 회의', '온라인', 1, 8],
    ['시스템 사용 교육', '본사 교육장', 2, 6],
    ['신규 가맹 상담', '본사 회의실', 2, 6],
    ['디자인 시안 검토', '본사 회의실', 1, 5],
  ];
  const ALL_DAY_ORG: [string, number, number][] = [
    // 제목, 일수(최대), 가중치
    ['월 마감', 1, 10],
    ['정기 차량 점검일', 1, 6],
    ['이사·인테리어 박람회 참가', 3, 3],
    ['지점장 워크숍', 2, 3],
    ['출장', 2, 6],
  ];
  const PRIVATE: [string, boolean, number][] = [
    // 제목, 종일 여부, 가중치
    ['연차', true, 30],
    ['반차', false, 14],
    ['병원 예약', false, 12],
    ['은행 업무', false, 6],
    ['자녀 학교 행사', false, 6],
    ['개인 일정', false, 12],
    ['자격증 시험', true, 3],
  ];
  for (let dn = START; dn <= TODAY + 30; dn++) {
    const weekend = isWeekend(dn);
    const lam = (weekend ? 0.35 : 3.4) * growth(dn);
    const n = poisson(lam);
    for (let i = 0; i < n; i++) {
      const owner = chance(0.6) && branchEmps.length ? one(branchEmps) : one(hqPool);
      const isBranch = branchEmps.includes(owner);
      const kind = pick([
        ['ORG_TIMED', weekend ? 20 : 62],
        ['ORG_ALLDAY', weekend ? 30 : 14],
        ['PRIVATE', weekend ? 50 : 24],
      ] as const);
      const created = Math.min(NOW, +ts(dn - int(1, 14), int(9, 18), int(0, 59)));
      const base = {
        id: oid('cal'),
        ownerUserId: owner.userId,
        source: chance(0.08) ? 'GOOGLE' : 'LOCAL',
        createdAt: new Date(created),
        date: dateOf(dn),
      };
      if (kind === 'PRIVATE') {
        const [title, allDay] = pick(PRIVATE.map(([t, a, w]) => [[t, a] as const, w] as const));
        const days = title === '연차' && chance(0.3) ? int(2, 4) : 1;
        const h = int(9, 16);
        events.push({
          ...base,
          title,
          visibility: 'PRIVATE',
          orgUnitId: null,
          color: '#AF52DE',
          endDate: days > 1 ? dateOf(dn + days - 1) : null,
          startTime: allDay ? null : hhmm(h, chance(0.5) ? 0 : 30),
          endTime: allDay ? null : hhmm(h + (title === '반차' ? 4 : 1), chance(0.5) ? 0 : 30),
        });
      } else if (kind === 'ORG_ALLDAY') {
        const [title, maxDays] = pick(
          ALL_DAY_ORG.map(([t, d, w]) => [[t, d] as const, w] as const),
        );
        const days = int(1, maxDays);
        events.push({
          ...base,
          title,
          visibility: 'ORG',
          orgUnitId: owner.orgUnitId,
          color: title === '월 마감' ? '#FF3B30' : '#FF9500',
          endDate: days > 1 ? dateOf(dn + days - 1) : null,
          startTime: null,
          endTime: null,
          location: title.includes('박람회') ? one(['코엑스', '킨텍스', '세텍', '벡스코']) : null,
        });
      } else {
        const [title, location, hours] = pick(
          (isBranch ? BRANCH_ORG : HQ_ORG).map(([t, l, h, w]) => [[t, l, h] as const, w] as const),
        );
        const h = int(8, 18 - hours);
        const m = chance(0.6) ? 0 : 30;
        events.push({
          ...base,
          title,
          visibility: 'ORG',
          orgUnitId: owner.orgUnitId,
          color: one(COLORS.slice(0, 4)),
          location,
          startTime: hhmm(h, m),
          endTime: hhmm(h + hours, m),
          description: chance(0.3) ? `${owner.orgName} 공유 일정` : null,
        });
      }
    }
  }

  // ════════════════ 2. 청구(거래처) ════════════════
  type Inv = Prisma.InvoiceCreateManyInput & { createdAt: Date };
  const invoices: Inv[] = [];
  const receipts: Prisma.InvoiceReceiptCreateManyInput[] = [];
  let partners = await prisma.partner.findMany({
    where: { type: 'B2B_CLIENT', isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: { code: 'asc' },
  });
  if (partners.length < 10)
    partners = partners.concat(
      await prisma.partner.findMany({
        where: { type: 'EXCLUSIVE', isActive: true },
        select: { id: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
    );
  if (partners.length && branches.length) {
    // 거래가 많은 거래처 30곳 — 거래처마다 담당 지점·월 이용량이 정해져 있다
    const active = partners.slice(0, 30).map((p) => ({
      ...p,
      org: branches[Math.floor(hash01(p.id + 'org') * branches.length)].id,
      moves: 1 + 6 * hash01(p.id + 'vol'),
    }));
    let invNo = 0;
    const addInvoice = (
      p: (typeof active)[number],
      issueDn: number,
      title: string,
      amount: number,
    ) => {
      const due = issueDn + 30;
      const created = issueDn - int(0, 3);
      const fresh = issueDn > TODAY - 3;
      let status: string;
      if (issueDn > TODAY) status = 'DRAFT';
      else if (chance(0.025)) status = 'CANCELED';
      else if (fresh && chance(0.4)) status = 'DRAFT';
      else if (due < TODAY - 20) status = chance(0.95) ? 'COLLECTED' : 'ISSUED';
      else if (due < TODAY) status = chance(0.7) ? 'COLLECTED' : 'ISSUED';
      else status = chance(0.25) ? 'COLLECTED' : 'ISSUED';
      const id = oid('inv');
      const issuedAt = status === 'DRAFT' ? null : ts(issueDn, int(9, 17), int(0, 59));
      invoices.push({
        id,
        invoiceNo: '',
        legacyNo: mark('IV', ++invNo),
        partnerId: p.id,
        orgUnitId: p.org,
        title,
        amount,
        status,
        issuedAt,
        dueDate: dateOf(due),
        memo: status === 'CANCELED' ? '금액 정정으로 재발행' : null,
        createdAt: ts(Math.min(created, TODAY), int(9, 17), int(0, 59)),
      });
      if (!issuedAt) return;
      const lastDay = Math.min(TODAY, due + 25);
      if (status === 'COLLECTED') {
        const split = chance(0.2);
        const first = split ? round(amount * (0.3 + 0.4 * rnd()), 10_000) : amount;
        const d1 = Math.min(lastDay, issueDn + int(7, 35));
        receipts.push({
          id: oid('rcp'),
          invoiceId: id,
          amount: first,
          method: pick([
            ['TRANSFER', 92],
            ['CARD', 6],
            ['CASH', 2],
          ]),
          receivedAt: ts(Math.max(issueDn, d1), int(10, 16), int(0, 59)),
          memo: split ? '1차 입금' : null,
        });
        if (split)
          receipts.push({
            id: oid('rcp'),
            invoiceId: id,
            amount: amount - first,
            method: 'TRANSFER',
            receivedAt: ts(Math.min(lastDay, Math.max(d1, issueDn) + int(5, 20)), int(10, 16)),
            memo: '잔액 입금',
          });
      } else if (status === 'ISSUED' && issueDn < TODAY - 10 && chance(0.3)) {
        // 부분 수금
        receipts.push({
          id: oid('rcp'),
          invoiceId: id,
          amount: round(amount * (0.2 + 0.4 * rnd()), 10_000),
          method: 'TRANSFER',
          receivedAt: ts(Math.min(TODAY, issueDn + int(5, 30)), int(10, 16)),
          memo: '부분 입금',
        });
      }
    };
    for (let y = 2025; ; y++) {
      let stop = false;
      for (let m = 0; m < 12; m++) {
        const first = dnOf(y, m, 1);
        if (first > TODAY) {
          stop = true;
          break;
        }
        const issueDn = weekdayOnOrAfter(first + int(1, 6));
        const prevSeason = season(first - 10);
        for (const p of active) {
          // 지난달 임직원 이사 건수 → 월별 청구
          const moves = poisson(p.moves * prevSeason * growth(first));
          if (!moves) continue;
          const amount = round(moves * (1_600_000 + 1_400_000 * rnd()), 10_000);
          const pm = m === 0 ? 12 : m;
          addInvoice(p, issueDn, `${p.name} ${pm}월 임직원 이사(${moves}건)`, amount);
        }
        // 기업이전(사무실 이사) 건별 청구 — 달에 몇 건
        const officeMoves = poisson(5 * season(first));
        for (let k = 0; k < officeMoves; k++) {
          const p = one(active);
          const dn = weekdayOnOrAfter(first + int(0, lastDayOfMonth(y, m) - 1));
          if (dn > TODAY) continue;
          addInvoice(
            p,
            dn,
            `${p.name} ${one(['본사', '지사', '연구소', '물류센터', '영업소'])} 사무실 이전`,
            round(4_000_000 + 26_000_000 * rnd() ** 2, 100_000),
          );
        }
      }
      if (stop) break;
    }
  }

  // ════════════════ 3. 상담 문자 ════════════════
  const sms: Prisma.CsSmsCreateManyInput[] = [];
  const templates = await prisma.csSmsTemplate.findMany({
    select: { title: true, body: true },
    orderBy: { sortOrder: 'asc' },
  });
  const TPL =
    templates.length > 0
      ? templates
      : [
          {
            title: '부재 안내',
            body: '[통인익스프레스] {고객명}님, 이사 상담 전화를 드렸으나 연결되지 않았습니다.',
          },
          {
            title: '접수 완료',
            body: '[통인익스프레스] {고객명}님, 이사 상담 접수가 완료되었습니다.',
          },
        ];
  const smsSenders: [Emp, number][] = [
    ...csEmps.map((e) => [e, 6] as [Emp, number]),
    ...branchEmps.map((e) => [e, 0.4] as [Emp, number]),
  ];
  if (customers.length && smsSenders.length) {
    for (let dn = START; dn <= TODAY; dn++) {
      const w = ymOf(dn).w;
      const lam = (w === 0 ? 0.3 : w === 6 ? 1.5 : 5) * season(dn) * growth(dn);
      for (let i = 0, n = poisson(lam); i < n; i++) {
        const sender = pick(smsSenders);
        const c = customerOf(sender.orgUnitId)!;
        const tpl = one(TPL);
        const moveDay = ymOf(dn + int(3, 40));
        const at = ts(dn, int(9, 19), int(0, 59));
        if (+at > NOW) continue;
        const ok = !chance(dn < TODAY - 30 ? 0.035 : 0.025);
        sms.push({
          id: oid('sms'),
          phone: c.phonePrimary!.replace(/\D/g, ''),
          customerId: c.id,
          title: tpl.title,
          body: tpl.body
            .replaceAll('{고객명}', c.name)
            .replaceAll(
              '{접수번호}',
              `RC${ymd(dn).slice(2).replaceAll('-', '')}${String(int(1, 40)).padStart(4, '0')}`,
            )
            .replaceAll('{이사일}', `${moveDay.m + 1}월 ${moveDay.d}일`),
          ok,
          reason: ok
            ? null
            : one(['수신 거부 번호', '없는 번호(결번)', '통신사 일시 오류', '단말기 꺼짐']),
          vendor: dn >= dnOf(2026, 10, 1) ? '한국AI통신' : '솔라피',
          employeeId: sender.id,
          at,
        });
      }
    }
  }

  // ════════════════ 4. 공간 예약 ════════════════
  const resv: Prisma.SpaceReservationCreateManyInput[] = [];
  const spaces = await prisma.space.findMany({
    where: { isActive: true },
    select: {
      id: true,
      kind: true,
      hourlyFee: true,
      openHour: true,
      closeHour: true,
      capacity: true,
    },
    orderBy: { sortOrder: 'asc' },
  });
  const MEETINGS = [
    '주간 경영회의',
    '마케팅 주간 회의',
    '전속 계약사 미팅',
    'CS 품질 회의',
    '신규 지점장 교육',
    '거래처 미팅',
    '면접',
    '디자인 리뷰',
    '가맹 상담',
    '월 실적 보고',
  ];
  const RENTALS: [string, number][] = [
    ['생일 파티', 20],
    ['돌잔치', 12],
    ['브라이덜 샤워', 8],
    ['동호회 모임', 14],
    ['기업 워크숍', 10],
    ['사진 촬영', 8],
    ['송년회', 6],
    ['세미나', 8],
  ];
  const bookers = mgmtEmps.length ? mgmtEmps : hqPool;
  let rentalPerson = 0;
  for (const s of spaces) {
    const rental = s.kind === 'RENTAL';
    const fee = s.hourlyFee ?? 60_000;
    for (let dn = START; dn <= TODAY + 30; dn++) {
      const weekend = isWeekend(dn);
      const { m } = ymOf(dn);
      const lam = rental
        ? (weekend ? 1.1 : 0.15) * (m === 11 ? 1.8 : m === 4 ? 1.3 : 1)
        : weekend
          ? 0
          : 2.6 * growth(dn);
      let cursor = s.openHour + (rental ? 0 : 1);
      for (let i = 0, n = poisson(lam); i < n; i++) {
        const hours = rental
          ? int(3, 5)
          : pick([
              [1, 60],
              [2, 35],
              [3, 5],
            ] as const);
        const startH = cursor + (rental ? int(0, 2) : int(0, 2));
        if (startH + hours > s.closeHour) break;
        cursor = startH + hours;
        const startAt = ts(dn, startH, rental || chance(0.7) ? 0 : 30);
        const endAt = new Date(+startAt + hours * 3600_000);
        const cancelled = chance(rental ? 0.08 : 0.06);
        const booker = rental ? one(bookers) : one(hqPool);
        const createdAt = new Date(Math.min(NOW, +startAt - int(1, rental ? 40 : 10) * DAY));
        const past = +endAt < NOW;
        if (rental) {
          const n2 = ++rentalPerson;
          const title = pick(
            RENTALS.map(([t, w]) => [t, t === '송년회' && m !== 11 ? 0 : w] as const),
          );
          resv.push({
            id: oid('spc'),
            spaceId: s.id,
            title,
            startAt,
            endAt,
            status: cancelled ? 'CANCELLED' : 'CONFIRMED',
            bookedBy: booker.userId,
            customerName: `${one(FAMILY)}${one(GIVEN)}`,
            customerPhone: fakePhone(n2),
            headcount: int(6, s.capacity ?? 30),
            fee: fee * hours,
            paid: !cancelled && (past || chance(0.6)),
            cancelledAt: cancelled ? new Date(Math.min(NOW, +createdAt + int(1, 5) * DAY)) : null,
            cancelledBy: cancelled ? booker.userId : null,
            createdAt,
          });
        } else {
          const attendees = new Set<string>();
          for (let k = int(2, 6); k > 0; k--) attendees.add(one(hqPool).id);
          resv.push({
            id: oid('spc'),
            spaceId: s.id,
            title: one(MEETINGS),
            startAt,
            endAt,
            status: cancelled ? 'CANCELLED' : 'CONFIRMED',
            bookedBy: booker.userId,
            attendeeEmpIds: [...attendees],
            cancelledAt: cancelled ? new Date(Math.min(NOW, +createdAt + DAY)) : null,
            cancelledBy: cancelled ? booker.userId : null,
            createdAt,
          });
        }
      }
    }
  }

  // ════════════════ 5. 리빙케어 주문 ════════════════
  type Svc = Prisma.ServiceOrderCreateManyInput & { createdAt: Date };
  const svcs: Svc[] = [];
  const svcProducts = await prisma.product.findMany({
    where: { serviceLine: { in: ['LIVING', 'CARE'] } },
    select: { id: true, code: true, name: true, serviceLine: true },
  });
  const SVC_PRICE: Record<string, [number, number]> = {
    'P-LV-CLEAN': [380_000, 0.35],
    'P-LV-ORG': [450_000, 0.4],
    'P-CR-AIRCON': [150_000, 0.45],
    'P-CR-SICKHOUSE': [300_000, 0.3],
  };
  /** 상품별 계절 — 청소·수납은 이사 성수기, 에어컨은 5~7월, 새집증후군은 입주철(2~3월·8~9월) */
  const svcSeason = (code: string, dn: number) => {
    const { m } = ymOf(dn);
    if (code === 'P-CR-AIRCON')
      return [0.3, 0.3, 0.4, 0.8, 1.8, 2.6, 2.2, 1.0, 0.5, 0.3, 0.3, 0.3][m];
    if (code === 'P-CR-SICKHOUSE') return season(dn) ** 1.5;
    return season(dn);
  };
  const SVC_RATE: Record<string, number> = {
    'P-LV-CLEAN': 1.1,
    'P-LV-ORG': 0.5,
    'P-CR-AIRCON': 0.6,
    'P-CR-SICKHOUSE': 0.35,
  };
  let svcNo = 0;
  if (svcProducts.length && branches.length) {
    for (let dn = START; dn <= TODAY + 21; dn++) {
      const w = ymOf(dn).w;
      for (const p of svcProducts) {
        const lam =
          (SVC_RATE[p.code] ?? 0.4) * svcSeason(p.code, dn) * growth(dn) * (w === 0 ? 0.3 : 1);
        for (let i = 0, n = poisson(lam); i < n; i++) {
          const b = pick(branchPick);
          const c = customerOf(b.id);
          const createdDn = dn - int(2, 20);
          const createdAt = ts(createdDn, int(9, 19), int(0, 59));
          if (+createdAt > NOW) continue;
          const [mid, spread] = SVC_PRICE[p.code] ?? [300_000, 0.35];
          let status: string;
          if (dn < TODAY) status = chance(0.1) ? 'CANCELED' : 'DONE';
          else
            status = chance(0.06)
              ? 'CANCELED'
              : dn - TODAY < 7 || chance(0.6)
                ? 'SCHEDULED'
                : 'REQUESTED';
          svcs.push({
            id: oid('svc'),
            orderNo: '',
            legacyNo: mark('SV', ++svcNo),
            serviceLine: p.serviceLine!,
            productId: p.id,
            customerId: c?.id ?? null,
            orgUnitId: b.id,
            scheduledDate: dateOf(dn),
            address: c?.addr ? `${c.addr}${c.addrDetail ? ` ${c.addrDetail}` : ''}` : null,
            amount: round(mid * Math.exp(spread * (rnd() * 2 - 1)), 10_000),
            note: chance(0.25)
              ? one([
                  '오전 방문 희망',
                  '주차 가능',
                  '엘리베이터 사용 예약 필요',
                  '반려동물 있음',
                  '이사 당일 연계',
                ])
              : null,
            status,
            assignedEmpId: status === 'REQUESTED' ? null : one(b.emps).id,
            createdAt,
          });
        }
      }
    }
  }

  // ════════════════ 6·7. 자재 발주 · 입출고 ════════════════
  type Mo = Prisma.MaterialOrderCreateManyInput & { createdAt: Date };
  const orders: Mo[] = [];
  const lines: Prisma.MaterialOrderLineCreateManyInput[] = [];
  const moves: Prisma.StockMovementCreateManyInput[] = [];
  const materials = await prisma.material.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, category: true, unit: true, safetyStock: true },
    orderBy: { code: 'asc' },
  });
  if (materials.length && branches.length) {
    // 지점이 한 번에 시키는 양 — 박스는 수십~수백, 롤·박스 단위는 몇 개
    const orderQty = (m: (typeof materials)[number]) =>
      m.category === '박스'
        ? round(int(30, 200), 10)
        : m.unit === 'EA'
          ? round(int(10, 60), 5)
          : int(2, 12);
    const popular = materials.map(
      (m) =>
        [
          m,
          m.category === '박스'
            ? 6
            : m.category === '포장재'
              ? 4
              : m.category === '보양재'
                ? 3
                : 1.5,
        ] as const,
    );
    let moNo = 0;
    // 발주 — 지점마다 2~3주에 한 번꼴, 성수기에 더
    type Ev = {
      at: number;
      materialId: string;
      qty: number;
      orgId: string;
      orderNo: string;
      lineId: string;
      orderId: string;
    };
    const shipEvents: Ev[] = [];
    for (let dn = START; dn <= TODAY; dn++) {
      if (isWeekend(dn)) continue;
      for (const b of branches) {
        if (!chance(0.042 * b.w * season(dn + 10) ** 1.6)) continue;
        const createdAt = ts(dn, int(9, 18), int(0, 59));
        if (+createdAt > NOW) continue;
        const age = TODAY - dn;
        let status: string;
        if (age > 5) status = chance(0.06) ? 'CANCELED' : 'SHIPPED';
        else if (age > 2)
          status = pick([
            ['SHIPPED', 60],
            ['APPROVED', 30],
            ['REQUESTED', 10],
          ]);
        else
          status = pick([
            ['REQUESTED', 60],
            ['APPROVED', 30],
            ['CANCELED', 10],
          ]);
        const shipDn = weekdayOnOrAfter(dn + int(1, 3));
        const shippedAt =
          status === 'SHIPPED'
            ? new Date(Math.min(NOW, +ts(Math.min(shipDn, TODAY), int(10, 17), int(0, 59))))
            : null;
        const id = oid('mo');
        const n = ++moNo;
        orders.push({
          id,
          orderNo: '',
          legacyNo: mark('MO', n),
          orgUnitId: b.id,
          status,
          note: chance(0.2)
            ? one([
                '이번 주 대형 이사 3건 예정',
                '성수기 대비 선발주',
                '긴급 — 내일 작업분',
                '지난 발주 누락분',
              ])
            : null,
          shippedAt,
          createdAt,
        });
        const picked = new Set<string>();
        for (let k = int(1, 4); k > 0; k--) {
          const m = pick(popular);
          if (picked.has(m.id)) continue;
          picked.add(m.id);
          const lineId = oid('mol');
          const qty = orderQty(m);
          lines.push({ id: lineId, orderId: id, materialId: m.id, qty });
          if (shippedAt)
            shipEvents.push({
              at: +shippedAt,
              materialId: m.id,
              qty,
              orgId: b.id,
              orderNo: '',
              lineId,
              orderId: id,
            });
        }
      }
    }
    // 화면 번호를 먼저 붙여야 출고 사유에 번호를 쓴다 — 아래 assignNo 뒤에 사유를 채운다
    const lineMove = new Map<string, Prisma.StockMovementCreateManyInput>();

    // 재고 흐름 — 자재별로 시간 순서대로. 기초 재고 입고 → 출고 → 안전재고 밑이면 입고 → 월말 실사
    const byMat = new Map<string, Ev[]>();
    for (const e of shipEvents) {
      if (!byMat.has(e.materialId)) byMat.set(e.materialId, []);
      byMat.get(e.materialId)!.push(e);
    }
    for (const m of materials) {
      const evs = (byMat.get(m.id) ?? []).sort((a, b) => a.at - b.at);
      const lot = Math.max(m.safetyStock, 10);
      let bal = 0;
      const addIn = (at: number, qty: number, reason: string) => {
        bal += qty;
        moves.push({
          id: oid('stk'),
          materialId: m.id,
          type: 'IN',
          qtyDelta: qty,
          reason,
          createdAt: new Date(at),
        });
      };
      addIn(+ts(START + 1, 9, 30), round(lot * 4, 10), '기초 재고 입고');
      let month = ymOf(START).m;
      for (const e of evs) {
        const dn = Math.floor((e.at + 9 * 3600_000) / DAY);
        const mm = ymOf(dn).m;
        if (mm !== month) {
          // 월말 실사 — 몇 개 차이
          month = mm;
          if (chance(0.35)) {
            const delta = chance(0.7) ? -int(1, Math.max(2, Math.round(lot * 0.03))) : int(1, 5);
            if (bal + delta >= 0) {
              bal += delta;
              const { y, m: pm } = ymOf(dn - ymOf(dn).d);
              moves.push({
                id: oid('stk'),
                materialId: m.id,
                type: 'ADJUST',
                qtyDelta: delta,
                reason: delta < 0 ? '월말 재고 실사 — 파손·분실' : '월말 재고 실사 — 미기록 반품',
                createdAt: ts(dnOf(y, pm, lastDayOfMonth(y, pm)), 17, 30),
              });
            }
          }
        }
        if (bal - e.qty < m.safetyStock) {
          // 공급처 입고 — 출고 하루 전 오전(급하면 같은 날 아침)
          const need = e.qty + m.safetyStock - bal;
          const qty = round(Math.max(need, lot * (2 + 2 * rnd())), 10);
          const inAt = Math.min(e.at - 3600_000, +ts(dn - (chance(0.7) ? 1 : 0), 9, int(0, 30)));
          addIn(inAt, qty, chance(0.85) ? '정기 매입 입고' : '긴급 매입 입고');
        }
        bal -= e.qty;
        const mv: Prisma.StockMovementCreateManyInput = {
          id: oid('stk'),
          materialId: m.id,
          orgUnitId: e.orgId,
          type: 'OUT',
          qtyDelta: -e.qty,
          reason: '',
          refType: 'MATERIAL_ORDER',
          refId: e.orderId,
          createdAt: new Date(e.at),
        };
        moves.push(mv);
        lineMove.set(e.lineId, mv);
      }
    }
    for (const l of lines) {
      const mv = lineMove.get(l.id!);
      if (mv) l.stockMovementId = mv.id;
    }

    await assignNo(orders, 'MO', (r, no) => (r.orderNo = no));
    const noOf = new Map(orders.map((o) => [o.id!, o.orderNo]));
    for (const mv of lineMove.values()) mv.reason = `가맹점 발주 ${noOf.get(mv.refId!)} 출고`;
  }

  // ── 화면 번호 — 앱과 같은 next_doc_no로, 날짜·시각 순서대로 ──
  async function assignNo<T extends { createdAt: Date }>(
    rows: T[],
    prefix: string,
    set: (r: T, no: string) => void,
  ) {
    const list = [...rows].sort((a, b) => +a.createdAt - +b.createdAt);
    for (let i = 0; i < list.length; i += 5000) {
      const part = list.slice(i, i + 5000);
      const days = part.map((r) => ymd(Math.floor((+r.createdAt + 9 * 3600_000) / DAY)));
      const out = await prisma.$queryRawUnsafe<{ no: string }[]>(
        `SELECT next_doc_no($1, u.d::date) AS no FROM unnest($2::text[]) WITH ORDINALITY AS u(d, i) ORDER BY u.i`,
        prefix,
        days,
      );
      part.forEach((r, k) => set(r, out[k].no));
    }
  }
  await assignNo(invoices, 'IV', (r, no) => (r.invoiceNo = no));
  await assignNo(svcs, 'SV', (r, no) => (r.orderNo = no));

  // ── 넣기 ──
  const chunk = async <T>(rows: T[], fn: (data: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000));
  };
  await prisma.$transaction(
    async (tx) => {
      await chunk(events, (data) => tx.calendarEvent.createMany({ data }));
      await chunk(invoices, (data) => tx.invoice.createMany({ data }));
      await chunk(receipts, (data) => tx.invoiceReceipt.createMany({ data }));
      await chunk(sms, (data) => tx.csSms.createMany({ data }));
      await chunk(resv, (data) => tx.spaceReservation.createMany({ data }));
      await chunk(svcs, (data) => tx.serviceOrder.createMany({ data }));
      await chunk(moves, (data) => tx.stockMovement.createMany({ data }));
      await chunk(orders, (data) => tx.materialOrder.createMany({ data }));
      await chunk(lines, (data) => tx.materialOrderLine.createMany({ data }));
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  const priv = events.filter((e) => e.visibility === 'PRIVATE').length;
  console.log(
    `[demo-history-ops] ${ymd(START)} ~ ${ymd(TODAY)} — 일정 ${events.length}(개인 ${priv}) · ` +
      `청구 ${invoices.length}(수금 ${receipts.length}) · 상담 문자 ${sms.length} · 공간 예약 ${resv.length} · ` +
      `리빙케어 주문 ${svcs.length} · 자재 발주 ${orders.length}(품목 ${lines.length}) · 입출고 ${moves.length} ` +
      `(${Math.round((Date.now() - t0) / 100) / 10}초)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
