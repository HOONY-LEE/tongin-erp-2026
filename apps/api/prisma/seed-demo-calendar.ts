/**
 * 데모 캘린더 일정 — 2026년 8월 ~ 12월(날짜 고정).
 *
 * 지점 회의·월례 점검·재고 실사·교육·연말 행사(조직 공유)와 지점장 방문견적(개인)을 실제 달력에 맞춰 넣는다.
 * 공휴일(광복절·추석·개천절·한글날·성탄절 등)은 달력이 직접 빨간 날로 보여 주므로 일정으로 넣지 않고,
 * 반복 일정은 공휴일을 피한다. 이사 작업은 작업오더(seed-demo-regions)가 따로 보여 준다.
 *
 * 다시 돌리면 이 스크립트가 만든 일정(설명 앞 [demo-cal])만 지우고 새로 만든다.
 * 실행: pnpm --filter @tongin/api demo:seed:calendar  (demo:seed:all에 포함)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TAG = '[demo-cal]';

/** 2026 법정 공휴일 — 반복 일정이 피해 간다(웹 calendarUtils KR_HOLIDAYS와 같은 목록) */
const HOLIDAYS = new Set([
  '2026-08-15',
  '2026-08-17',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-10-03',
  '2026-10-05',
  '2026-10-09',
  '2026-12-25',
]);

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** DATE 컬럼은 UTC 자정으로 넣는다(로컬 자정이면 하루 밀린다) */
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const isWorkday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !HOLIDAYS.has(ymd(d));

/** 기간 안의 날짜들 */
function daysBetween(from: string, to: string): Date[] {
  const out: Date[] = [];
  for (let d = utc(from); d <= utc(to); d = new Date(d.getTime() + 86_400_000)) out.push(d);
  return out;
}
/** 그 날이 쉬는 날이면 다음 평일로 */
function nextWorkday(d: Date): Date {
  let x = d;
  while (!isWorkday(x)) x = new Date(x.getTime() + 86_400_000);
  return x;
}

interface Ev {
  title: string;
  date: string;
  endDate?: string;
  start?: string;
  end?: string;
  color: string;
  location?: string;
  scope: 'ORG' | 'PRIVATE';
  branch?: string;
  owner: string;
  description?: string;
}

const BLUE = '#007AFF';
const GREEN = '#34C759';
const ORANGE = '#FF9500';
const PURPLE = '#AF52DE';
const PINK = '#FF2D55';
const RED = '#FF3B30';

const BRANCHES = [
  { code: 'BR-GN', name: '강남점', owner: 'gn.manager' },
  { code: 'BR-SP', name: '송파점', owner: 'sp.manager' },
  { code: 'BR-BD', name: '분당점', owner: 'bd.manager' },
  { code: 'BR-IS', name: '일산점', owner: 'is.manager' },
  { code: 'BR-BS', name: '부산점', owner: 'bs.manager' },
];

/** 방문견적 고객·주소(지점별) — 개인 일정 */
const VISITS: Record<string, [string, string][]> = {
  'BR-GN': [
    ['압구정 임재원', '서울 강남구 압구정로 419'],
    ['역삼 표지훈', '서울 강남구 도산대로 318'],
    ['대치 문서연', '서울 강남구 삼성로 212'],
    ['개포 남궁민', '서울 강남구 개포로 310'],
    ['청담 하은솔', '서울 강남구 선릉로 818'],
  ],
  'BR-SP': [
    ['위례 양다온', '서울 송파구 마천로 215'],
    ['잠실 도윤호', '서울 송파구 올림픽로 135'],
    ['문정 지하람', '서울 송파구 법원로 128'],
    ['가락 곽서진', '서울 송파구 송파대로 345'],
  ],
  'BR-BD': [
    ['정자 오지민', '경기 성남시 분당구 정자일로 95'],
    ['서현 류시우', '경기 성남시 분당구 서현로 210'],
    ['판교 백하린', '경기 성남시 분당구 판교역로 166'],
  ],
  'BR-IS': [
    ['일산동구 마준혁', '경기 고양시 일산동구 중앙로 1275'],
    ['킨텍스 신예린', '경기 고양시 일산서구 킨텍스로 217'],
    ['탄현 엄도겸', '경기 고양시 일산서구 탄현로 42'],
  ],
  'BR-BS': [
    ['해운대 추서윤', '부산 해운대구 센텀중앙로 79'],
    ['수영 봉민재', '부산 수영구 광안해변로 219'],
    ['남구 탁유나', '부산 남구 수영로 312'],
  ],
};

function buildEvents(): Ev[] {
  const evs: Ev[] = [];
  const all = daysBetween('2026-08-01', '2026-12-31');

  // ── 주간 회의 — 월요일(공휴일이면 그 주 화요일) ──
  for (const d of all.filter((x) => x.getUTCDay() === 1)) {
    const day = nextWorkday(d);
    for (const [i, b] of BRANCHES.entries()) {
      // 강남·송파는 매주, 나머지는 격주
      const week = Math.floor((d.getTime() - utc('2026-08-03').getTime()) / (7 * 86_400_000));
      if (i >= 2 && week % 2 === 1) continue;
      evs.push({
        title: `${b.name} 주간 회의`,
        date: ymd(day),
        start: i % 2 === 0 ? '09:00' : '09:30',
        end: i % 2 === 0 ? '10:00' : '10:30',
        color: BLUE,
        location: `${b.name} 회의실`,
        scope: 'ORG',
        branch: b.code,
        owner: b.owner,
      });
    }
  }

  // ── 매월 — 월례 점검(지점별 다른 주), 차량 정기점검(둘째 목), 재고 실사(마지막 평일) ──
  for (const month of [8, 9, 10, 11, 12]) {
    const mm = String(month).padStart(2, '0');
    const inMonth = all.filter((x) => x.getUTCMonth() + 1 === month);
    const workdays = inMonth.filter(isWorkday);
    for (const [i, b] of BRANCHES.entries()) {
      const d = workdays[Math.min(workdays.length - 1, 3 + i * 3)];
      evs.push({
        title: `${b.name} 월례 점검`,
        date: ymd(d),
        start: '14:00',
        end: '16:00',
        color: ORANGE,
        location: b.name,
        scope: 'ORG',
        branch: b.code,
        owner: b.owner,
      });
    }
    const thursdays = inMonth.filter((x) => x.getUTCDay() === 4);
    evs.push({
      title: '차량 정기점검',
      date: ymd(nextWorkday(thursdays[1])),
      start: '14:00',
      end: '17:00',
      color: ORANGE,
      location: '강남점 주차장',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
      description: '2.5톤·5톤 차량 전수 점검',
    });
    evs.push({
      title: `${month}월 자재 재고 실사`,
      date: ymd(workdays[workdays.length - 1]),
      start: '15:00',
      end: '18:00',
      color: PURPLE,
      location: '본사 창고',
      scope: 'ORG',
      branch: 'BR-SP',
      owner: 'sp.manager',
    });
    evs.push({
      title: `${month}월 실적 마감 회의`,
      date: ymd(workdays[workdays.length - 2]),
      start: '16:00',
      end: '17:30',
      color: BLUE,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
      description: `2026-${mm} 지점별 접수·계약·매출 점검`,
    });
  }

  // ── 교육·행사(날짜 고정) ──
  const fixed: Ev[] = [
    {
      title: '신입 현장교육 (3일)',
      date: '2026-08-19',
      endDate: '2026-08-21',
      color: GREEN,
      location: '본사 교육장',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
      description: '보양·포장·가구 분해조립 실습',
    },
    {
      title: '하반기 성수기 대비 회의',
      date: '2026-08-24',
      start: '10:00',
      end: '12:00',
      color: BLUE,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
    },
    {
      title: '3분기 안전교육',
      date: '2026-09-09',
      start: '13:00',
      end: '16:00',
      color: GREEN,
      location: '본사 교육장',
      scope: 'ORG',
      branch: 'BR-BD',
      owner: 'bd.manager',
    },
    {
      title: '추석 전 이사 물량 점검',
      date: '2026-09-21',
      start: '10:00',
      end: '11:30',
      color: RED,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
      description: '연휴(9/24~9/27) 전후 작업 배정·차량 확인',
    },
    {
      title: '추석 연휴 후 일정 재조정',
      date: '2026-09-28',
      start: '09:00',
      end: '10:30',
      color: BLUE,
      location: '강남점 회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
    },
    {
      title: '가을 이사 성수기 캠페인 회의',
      date: '2026-10-13',
      start: '15:00',
      end: '16:30',
      color: BLUE,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-SP',
      owner: 'sp.manager',
    },
    {
      title: '전속업체 간담회',
      date: '2026-10-21',
      start: '14:00',
      end: '17:00',
      color: PURPLE,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
      description: '한일운수·대양물류 등 하반기 단가·배차 협의',
    },
    {
      title: '신입 현장교육 (3일)',
      date: '2026-11-11',
      endDate: '2026-11-13',
      color: GREEN,
      location: '본사 교육장',
      scope: 'ORG',
      branch: 'BR-SP',
      owner: 'sp.manager',
      description: '겨울철 보양(결빙 대비) 포함',
    },
    {
      title: '동절기 차량·장비 점검',
      date: '2026-11-24',
      start: '13:00',
      end: '17:00',
      color: ORANGE,
      location: '송파점 주차장',
      scope: 'ORG',
      branch: 'BR-SP',
      owner: 'sp.manager',
    },
    {
      title: '4분기 안전교육',
      date: '2026-12-09',
      start: '13:00',
      end: '16:00',
      color: GREEN,
      location: '본사 교육장',
      scope: 'ORG',
      branch: 'BR-BD',
      owner: 'bd.manager',
    },
    {
      title: '연말 결산 회의',
      date: '2026-12-16',
      start: '10:00',
      end: '12:00',
      color: BLUE,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
    },
    {
      title: '송년회',
      date: '2026-12-23',
      start: '18:00',
      end: '21:00',
      color: PINK,
      location: '강남역 인근',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
    },
    {
      title: '2027 사업계획 워크숍 (2일)',
      date: '2026-12-28',
      endDate: '2026-12-29',
      color: GREEN,
      location: '본사 교육장',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
    },
    {
      title: '종무식',
      date: '2026-12-31',
      start: '16:00',
      end: '17:00',
      color: BLUE,
      location: '본사 대회의실',
      scope: 'ORG',
      branch: 'BR-GN',
      owner: 'gn.manager',
    },
  ];
  evs.push(...fixed);

  // ── 개인 — 지점장 방문견적: 화·목, 지점마다 다른 시간 ──
  let k = 0;
  for (const d of all.filter((x) => isWorkday(x) && (x.getUTCDay() === 2 || x.getUTCDay() === 4))) {
    for (const [i, b] of BRANCHES.entries()) {
      k += 1;
      // 지점마다 주 1~2회 — 결정적으로 건너뛴다
      if ((k + i) % 3 === 0) continue;
      const list = VISITS[b.code];
      const [who, addr] = list[k % list.length];
      const hour = 10 + ((k * 3 + i) % 7);
      evs.push({
        title: `방문견적 — ${who}`,
        date: ymd(d),
        start: `${String(hour).padStart(2, '0')}:00`,
        end: `${String(hour + 1).padStart(2, '0')}:00`,
        color: PINK,
        location: addr,
        scope: 'PRIVATE',
        owner: b.owner,
      });
    }
  }
  return evs;
}

async function main() {
  const users = await prisma.appUser.findMany({ select: { id: true, loginId: true } });
  const userByLogin = new Map(users.map((u) => [u.loginId, u.id]));
  const branches = await prisma.orgUnit.findMany({
    where: { code: { in: BRANCHES.map((b) => b.code) } },
    select: { id: true, code: true },
  });
  const branchByCode = new Map(branches.map((b) => [b.code, b.id]));
  if (!branchByCode.size || !userByLogin.has('gn.manager')) {
    console.error(
      '지점·데모 계정이 없다 — 먼저 `pnpm --filter @tongin/api demo:seed` 를 돌려야 한다',
    );
    process.exit(1);
  }

  const removed = await prisma.calendarEvent.deleteMany({
    where: { description: { startsWith: TAG } },
  });
  let n = 0;
  for (const e of buildEvents()) {
    const ownerUserId = userByLogin.get(e.owner);
    if (!ownerUserId) continue;
    await prisma.calendarEvent.create({
      data: {
        title: e.title,
        description: `${TAG}${e.description ? ' ' + e.description : ''}`,
        date: utc(e.date),
        endDate: e.endDate ? utc(e.endDate) : null,
        startTime: e.start ?? null,
        endTime: e.end ?? null,
        color: e.color,
        location: e.location ?? null,
        visibility: e.scope,
        ownerUserId,
        orgUnitId: e.scope === 'ORG' ? (branchByCode.get(e.branch ?? '') ?? null) : null,
        source: 'LOCAL',
      },
    });
    n += 1;
  }
  console.log(`캘린더 일정 2026-08 ~ 12: ${n}건 생성 (이전 데모 ${removed.count}건 교체)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
