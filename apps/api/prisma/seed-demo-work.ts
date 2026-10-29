/**
 * 시드 — 공통 업무 메뉴: 공지사항 · 팀 업무 · 계약·자산 · 지점 관리 기록.
 *
 *   pnpm --filter @tongin/api demo:seed:work
 *
 * seed-demo.ts(실제 조직도·직원·지점)를 먼저 돌려야 한다 — 부서·직원·지점을 이름/코드로 찾아 쓴다
 * (못 찾은 사람·지점은 비워 두거나 그 건을 건너뛴다).
 * 날짜는 오늘 기준 상대일. 멱등하다 — 행마다 고정 id로 upsert(다시 돌리면 내용·날짜만 새로 맞춘다).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 오늘 기준 상대일 → UTC 자정(DATE 컬럼) */
function day(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
/** 오늘 기준 상대일 + 시각 */
function at(offset: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d;
}
/** 데모 행 고정 id — 모델마다 앞자리를 달리한다 */
const fixedId = (model: number, n: number) =>
  `d3e0f00${model}-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ── 공지사항 ── [작성자, 대상(ALL 또는 부서 코드들), 고정, 며칠 전, 제목, 본문]
const NOTICES: [string, 'ALL' | string[], boolean, number, string, string][] = [
  [
    '김완성',
    'ALL',
    true,
    2,
    '새 ERP 시스템 전면 사용 안내',
    '11월 1일부터 접수·견적·계약·작업과 결재·휴가·근태를 모두 새 ERP에서 처리합니다.\n\n- 옛 전산은 10월 31일까지 조회만 가능합니다.\n- 팀별 엑셀 업무표는 [팀 업무] 메뉴로 옮겨 주세요.\n- 로그인이 안 되면 경영관리팀(강은숙 차장)으로 연락 바랍니다.',
  ],
  [
    '강은숙',
    'ALL',
    true,
    6,
    '2026년 하반기 연차 사용 촉진 안내',
    '남은 연차는 12월 31일까지 사용해 주세요. 미사용 연차는 이월되지 않습니다.\n휴가 신청은 [휴가] 메뉴에서 하면 결재선이 자동으로 잡힙니다.',
  ],
  [
    '이상은',
    'ALL',
    false,
    12,
    '서초 사옥 11월 소방 점검 일정',
    '11월 둘째 주 화요일 오전 10시~12시 소방 설비 점검이 있습니다. 점검 중 경보가 울릴 수 있으니 놀라지 마세요.',
  ],
  [
    '정철민',
    ['DEPT-FRAN'],
    false,
    3,
    '[가맹] 4분기 지점 현장점검 계획',
    '4분기 현장점검은 수도권 → 충청 → 영남 순으로 진행합니다.\n점검 결과는 [지점 관리 기록]에 "현장점검"으로 남겨 주세요. 지적 사항은 기한을 꼭 넣어 주세요.',
  ],
  [
    '김미선',
    ['DEPT-CS', 'DEPT-HOME'],
    false,
    1,
    '[고객관리] 이사 당일 클레임 응대 기준 변경',
    '파손 클레임은 접수 당일 사진을 받고, 보험 처리 여부를 24시간 안에 고객에게 안내합니다.\n홈플래너팀은 방문견적 때 고가 가구를 사진으로 남겨 주세요.',
  ],
  [
    '송승호',
    ['DEPT-MKT', 'DEPT-DESIGN'],
    false,
    8,
    '[마케팅] 연말 이사 프로모션 일정 공유',
    '12월 비수기 프로모션(조기 예약 할인) 문자 캠페인은 11월 20일 발송 예정입니다. 배너·상세페이지 시안은 디자인팀에 업무 요청으로 올렸습니다.',
  ],
];

// ── 팀 업무 ── [팀 코드, 담당, 요청자, 사업, 상태, 우선순위, 기한(상대일|null), 제목, 설명]
type T = [
  string,
  string | null,
  string | null,
  string | null,
  string,
  string,
  number | null,
  string,
  string | null,
];
const TASKS: T[] = [
  [
    'DEPT-FRAN',
    '김준영',
    null,
    '가맹 모집',
    'IN_PROGRESS',
    'A',
    7,
    '신규 가맹 상담 3건 후속 미팅',
    '평택·세종·청주 예비 점주 2차 미팅 일정 잡기',
  ],
  [
    'DEPT-FRAN',
    '곽성수',
    null,
    null,
    'TODO',
    'B',
    14,
    '4분기 수도권 현장점검 일정표',
    '수도권 20개 지점 점검 순서·동행자 정리',
  ],
  [
    'DEPT-FRAN',
    '최봉준',
    null,
    null,
    'DONE',
    'B',
    -5,
    '지점 재계약 서류 회수',
    '10월 만료 지점 4곳 재계약서 원본 회수',
  ],
  [
    'DEPT-FRAN',
    '정철민',
    '김완성',
    '2027 사업계획',
    'TODO',
    'A',
    30,
    '2027 가맹 확장 목표 수립',
    '권역별 신규 출점 목표와 지원 예산안',
  ],
  [
    'DEPT-MGMT',
    '강은숙',
    null,
    null,
    'IN_PROGRESS',
    'A',
    3,
    '11월 급여 마감 준비',
    '근태 마감 후 수당 반영, 4대보험 변동 확인',
  ],
  [
    'DEPT-MGMT',
    '이상은',
    null,
    null,
    'TODO',
    'B',
    10,
    '법인차량 리스 갱신 견적 비교',
    '만료 예정 2대 — 3개 리스사 견적 받기',
  ],
  [
    'DEPT-MGMT',
    '이상은',
    null,
    null,
    'HOLD',
    'C',
    null,
    '사무실 복합기 교체 검토',
    '렌탈 만료 전 교체 여부 결정 대기(예산 확정 후)',
  ],
  [
    'DEPT-MGMT',
    '김완성',
    null,
    '2027 사업계획',
    'IN_PROGRESS',
    'A',
    21,
    '2027 손익 계획 초안',
    '팀별 예산 요청 취합',
  ],
  [
    'DEPT-CS',
    '김미선',
    null,
    null,
    'IN_PROGRESS',
    'A',
    2,
    '파손 클레임 보험 접수 2건',
    '강남·분당 건 — 보험사 서류 제출',
  ],
  [
    'DEPT-CS',
    '김은혜',
    null,
    null,
    'TODO',
    'B',
    5,
    '해피콜 결과 주간 리포트',
    '지난주 작업 완료 건 만족도 정리',
  ],
  [
    'DEPT-CS',
    '노은주',
    '피규열',
    '무브제 컨시어지',
    'TODO',
    'B',
    9,
    '컨시어지 고객 응대 스크립트',
    '무브제 고객 전용 상담 멘트 초안',
  ],
  ['DEPT-CS', '임기숙', null, null, 'DONE', 'C', -3, '부재 고객 재연락 목록 정리', null],
  [
    'DEPT-B2B',
    '이경철',
    null,
    '기업 이전',
    'IN_PROGRESS',
    'A',
    12,
    'OO제약 본사 이전 제안서',
    '3개 층 이전, 야간 작업 조건 포함',
  ],
  [
    'DEPT-B2B',
    '이경철',
    null,
    '기업 이전',
    'TODO',
    'B',
    25,
    '공공기관 이전 입찰 공고 검토',
    '조달청 공고 2건 요건 확인',
  ],
  [
    'DEPT-DESIGN',
    '전지숙',
    '송승호',
    '연말 프로모션',
    'IN_PROGRESS',
    'A',
    6,
    '연말 프로모션 배너 시안',
    '홈페이지 메인·모바일 배너 2종',
  ],
  [
    'DEPT-DESIGN',
    '왕채은',
    '피규열',
    '무브제 컨시어지',
    'TODO',
    'B',
    11,
    '무브제 컨시어지 안내 리플릿',
    'A4 2단 접지, 서비스 흐름 그림',
  ],
  [
    'DEPT-DESIGN',
    '정주연',
    '정철민',
    '가맹 모집',
    'DONE',
    'B',
    -2,
    '가맹 모집 브로슈어 수정',
    '수수료 표 갱신',
  ],
  [
    'DEPT-DESIGN',
    null,
    '김미선',
    null,
    'TODO',
    'C',
    15,
    '작업 완료 확인서 양식 리디자인',
    '현장 작업팀이 쓰는 확인서 가독성 개선',
  ],
  [
    'DEPT-MKT',
    '송승호',
    null,
    '연말 프로모션',
    'IN_PROGRESS',
    'A',
    8,
    '연말 프로모션 문자 캠페인 기획',
    '대상 고객군·할인 조건 확정',
  ],
  [
    'DEPT-MKT',
    '김수빈',
    null,
    null,
    'TODO',
    'B',
    4,
    '네이버 검색광고 키워드 정리',
    '10월 성과 기준 하위 키워드 정리',
  ],
  [
    'DEPT-MKT',
    '김수빈',
    '송승호',
    null,
    'HOLD',
    'C',
    null,
    '블로그 이사 후기 콘텐츠',
    '고객 동의 받은 후기 5건 대기',
  ],
  [
    'DEPT-MOVEJE',
    '피규열',
    null,
    '무브제 컨시어지',
    'IN_PROGRESS',
    'A',
    10,
    '컨시어지 서비스 런칭 준비',
    '가격표·응대 흐름·협력사 확정',
  ],
  [
    'DEPT-MOVEJE',
    '김태원',
    null,
    '무브제 컨시어지',
    'TODO',
    'B',
    18,
    '협력 청소업체 단가 협의',
    '입주청소 협력사 2곳 단가표',
  ],
  ['DEPT-MOVEJE', '김태원', null, null, 'DONE', 'B', -7, '9월 무브제 정산 자료 정리', null],
  [
    'DEPT-PARTNER',
    '오태환',
    null,
    null,
    'IN_PROGRESS',
    'B',
    6,
    '전속업체 차량 보험 증권 갱신 확인',
    '11월 만료 업체 3곳',
  ],
  [
    'DEPT-PARTNER',
    '오태환',
    '김완성',
    null,
    'TODO',
    'A',
    20,
    '전속업체 수수료율 재협상 자료',
    '최근 6개월 작업량·클레임 비율',
  ],
  [
    'DEPT-HOME',
    '주미선',
    null,
    null,
    'IN_PROGRESS',
    'A',
    1,
    '이번 주 방문견적 배정표',
    '강남·서초권 12건 배정',
  ],
  [
    'DEPT-HOME',
    '최동희',
    null,
    null,
    'TODO',
    'B',
    3,
    '견적 누락 건 재확인',
    '견적 후 계약 미전환 건 사유 정리',
  ],
  [
    'DEPT-HOME',
    '안수지',
    '김미선',
    null,
    'TODO',
    'B',
    7,
    '고가 가구 사진 촬영 기준 교육',
    '클레임 대응용 촬영 기준 공유',
  ],
  [
    'DEPT-HOME',
    '허윤무',
    null,
    '무브제 컨시어지',
    'HOLD',
    'C',
    null,
    '컨시어지 고객 방문견적 동행',
    '런칭 일정 확정 후 진행',
  ],
];

// ── 계약·자산 ── [종류, 이름, 상대방, 번호, 시작(상대일), 만료(상대일|null), 금액, 단위, 담당, 메모]
type A = [
  string,
  string,
  string,
  string | null,
  number,
  number | null,
  number | null,
  string | null,
  string,
  string | null,
];
const ASSETS: A[] = [
  [
    'LEASE',
    '서초 사옥 임대차(본사 3~5층)',
    '(주)서초빌딩',
    '임-2024-031',
    -700,
    395,
    18_500_000,
    'MONTH',
    '강은숙',
    '보증금 3억, 2년 단위 갱신. 갱신 3개월 전 통보',
  ],
  [
    'LEASE',
    '용인 물류창고 임대차',
    '용인로지스(주)',
    '임-2023-112',
    -1000,
    21,
    6_200_000,
    'MONTH',
    '이상은',
    '만료 전 재계약 협의 중 — 임대료 5% 인상 요청 받음',
  ],
  [
    'TRADEMARK',
    '통인익스프레스 상표권(제39류)',
    '특허청',
    '40-1234567',
    -3000,
    650,
    null,
    null,
    '강은숙',
    '운송·보관업. 10년 갱신',
  ],
  [
    'TRADEMARK',
    '무브제 상표권',
    '특허청',
    '40-2345678',
    -400,
    3250,
    null,
    null,
    '강은숙',
    '출원 후 등록 완료',
  ],
  [
    'PATENT',
    '이사물품 부피(CBM) 자동 산정 방법',
    '특허청',
    '10-2025-0012345',
    -300,
    6900,
    null,
    null,
    '김완성',
    '견적 앱 핵심 기능',
  ],
  [
    'INSURANCE',
    '화물배상책임보험',
    'OO화재해상보험',
    'P-2026-778812',
    -340,
    25,
    42_000_000,
    'YEAR',
    '강은숙',
    '전 지점 공통. 갱신 견적 요청 필요',
  ],
  [
    'INSURANCE',
    '영업배상책임보험',
    'OO손해보험',
    'P-2026-551203',
    -200,
    165,
    9_600_000,
    'YEAR',
    '이상은',
    null,
  ],
  [
    'INSURANCE',
    '임직원 단체상해보험',
    'OO생명',
    'G-2026-0091',
    -100,
    265,
    7_800_000,
    'YEAR',
    '강은숙',
    null,
  ],
  [
    'RENTAL',
    '법인차량 리스(카니발 2대)',
    'OO캐피탈',
    'L-2023-4410',
    -1080,
    -4,
    1_480_000,
    'MONTH',
    '이상은',
    '만료됨 — 반납/인수 결정 필요',
  ],
  [
    'RENTAL',
    '사무실 복합기 렌탈(3대)',
    'OO렌탈',
    'R-2024-0233',
    -650,
    12,
    390_000,
    'MONTH',
    '이상은',
    '교체 검토 중(팀 업무 참고)',
  ],
  ['ETC', '세무 기장 대리 계약', 'OO세무법인', null, -500, 230, 1_100_000, 'MONTH', '강은숙', null],
  [
    'ETC',
    '사옥 무인경비 계약',
    'OO보안',
    'S-2022-1188',
    -1400,
    60,
    260_000,
    'MONTH',
    '이상은',
    '자동 연장 조항 있음',
  ],
];

// ── 지점 관리 기록 ── [지점 코드, 종류, 상태, 발생(상대일), 기한(상대일|null), 담당, 금액, 제목, 내용]
type B = [
  string,
  string,
  string,
  number,
  number | null,
  string,
  number | null,
  string,
  string | null,
];
const CASES: B[] = [
  [
    'BE0037',
    'INSPECTION',
    'CLOSED',
    -20,
    -10,
    '곽성수',
    null,
    '정기 현장점검 — 차량·장비 상태',
    '탑차 2대 적재함 파손, 담요 부족. 10일 내 보완 확인 완료',
  ],
  [
    'BE0516',
    'INSPECTION',
    'IN_PROGRESS',
    -6,
    8,
    '곽성수',
    null,
    '정기 현장점검 — 작업자 복장·안전교육',
    '안전화 미착용 작업자 2명. 안전교육 실시 후 사진 제출 요청',
  ],
  [
    'BE0519',
    'ILLEGAL',
    'IN_PROGRESS',
    -12,
    5,
    '김준영',
    null,
    '타 브랜드 명의 영업 의심',
    '통인 차량에 타 업체 번호 스티커. 사실 확인서 요청',
  ],
  [
    'BE0763',
    'ILLEGAL',
    'OPEN',
    -2,
    12,
    '김준영',
    null,
    '권역 외 영업(수원권) 접수',
    '동탄점이 수원 영통 고객 직접 계약 — 권역 규정 위반 여부 확인',
  ],
  [
    'BE0526',
    'INSURANCE',
    'IN_PROGRESS',
    -9,
    7,
    '최봉준',
    3_200_000,
    '고객 가구 파손 보험 처리',
    '대리석 식탁 상판 파손. 보험사 손해사정 진행 중',
  ],
  [
    'BE0801',
    'INSURANCE',
    'CLOSED',
    -40,
    -15,
    '최봉준',
    850_000,
    '엘리베이터 벽면 긁힘 배상',
    '관리사무소 합의 완료, 보험 처리',
  ],
  [
    'BE0039',
    'INSURANCE',
    'OPEN',
    -1,
    14,
    '최봉준',
    1_500_000,
    '냉장고 운반 중 도어 찌그러짐',
    '고객 사진·견적서 접수 대기',
  ],
  [
    'BE0512',
    'LAWSUIT',
    'IN_PROGRESS',
    -90,
    45,
    '정철민',
    12_000_000,
    '고객 손해배상 청구 소송',
    '이사 지연으로 인한 숙박비·위자료 청구. 1차 변론 기일 대기',
  ],
  [
    'BE0575',
    'LAWSUIT',
    'CLOSED',
    -200,
    -60,
    '정철민',
    4_000_000,
    '전 직원 임금 청구 건',
    '조정 성립으로 종결',
  ],
  [
    'BE0861',
    'RENEWAL',
    'OPEN',
    -3,
    28,
    '김준영',
    null,
    '가맹 계약 만료 재계약 협의',
    '12월 만료. 수수료 조정 요청 있음',
  ],
  [
    'BE0749',
    'RENEWAL',
    'IN_PROGRESS',
    -15,
    10,
    '김준영',
    null,
    '재계약 — 점주 변경 동반',
    '양도양수 서류·신규 점주 교육 일정 조율',
  ],
  ['BE0044', 'RENEWAL', 'CLOSED', -45, -20, '최봉준', null, '가맹 재계약 완료', '3년 재계약 체결'],
  [
    'BE0781',
    'COMPLAINT',
    'OPEN',
    -1,
    3,
    '곽성수',
    null,
    '작업자 불친절 민원',
    '고객센터 접수 — 지점장 면담 후 결과 회신',
  ],
  [
    'BE0522',
    'COMPLAINT',
    'IN_PROGRESS',
    -5,
    2,
    '곽성수',
    200_000,
    '추가 요금 과다 청구 민원',
    '사다리차 비용 사전 고지 누락. 차액 환불 협의',
  ],
  [
    'BE0531',
    'COMPLAINT',
    'CLOSED',
    -30,
    -25,
    '곽성수',
    null,
    '작업 후 쓰레기 방치 민원',
    '지점 재방문 수거, 고객 사과',
  ],
];

async function main() {
  const orgs = await prisma.orgUnit.findMany({ select: { id: true, code: true, type: true } });
  const orgId = new Map(orgs.map((o) => [o.code, o.id]));
  const emps = await prisma.employee.findMany({
    where: { isActive: true, orgUnit: { type: { in: ['DEPT', 'GROUP', 'COMPANY'] } } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const empId = new Map<string, string>();
  for (const e of emps) if (!empId.has(e.name)) empId.set(e.name, e.id);
  const emp = (name: string | null) => (name ? (empId.get(name) ?? null) : null);

  // 공지
  let notices = 0;
  for (const [i, [author, audience, pinned, ago, title, body]] of NOTICES.entries()) {
    const id = fixedId(1, i + 1);
    const targets = audience === 'ALL' ? [] : audience.map((c) => orgId.get(c)).filter(Boolean);
    if (audience !== 'ALL' && !targets.length) continue;
    const data = {
      title,
      body,
      audience: audience === 'ALL' ? 'ALL' : 'ORG',
      pinned,
      authorEmpId: emp(author),
      createdAt: at(-ago, 9),
    };
    await prisma.notice.upsert({ where: { id }, update: data, create: { id, ...data } });
    await prisma.noticeOrgUnit.deleteMany({ where: { noticeId: id } });
    if (targets.length) {
      await prisma.noticeOrgUnit.createMany({
        data: targets.map((orgUnitId) => ({ noticeId: id, orgUnitId: orgUnitId! })),
      });
    }
    notices++;
  }

  // 팀 업무
  let tasks = 0;
  for (const [
    i,
    [team, assignee, requester, project, status, priority, due, title, desc],
  ] of TASKS.entries()) {
    const teamOrgId = orgId.get(team);
    if (!teamOrgId) continue;
    const id = fixedId(2, i + 1);
    const data = {
      title,
      description: desc ?? null,
      teamOrgId,
      assigneeEmpId: emp(assignee),
      requesterEmpId: emp(requester),
      project,
      status,
      priority,
      dueDate: due === null ? null : day(due),
      doneAt: status === 'DONE' ? at(due ?? 0, 17) : null,
      createdAt: at(-((i % 9) + 3), 10),
    };
    await prisma.teamTask.upsert({ where: { id }, update: data, create: { id, ...data } });
    tasks++;
  }

  // 계약·자산
  let assets = 0;
  for (const [
    i,
    [kind, name, counterparty, refNo, start, end, amount, unit, manager, memo],
  ] of ASSETS.entries()) {
    const id = fixedId(3, i + 1);
    const data = {
      kind,
      name,
      counterparty,
      refNo,
      startDate: day(start),
      endDate: end === null ? null : day(end),
      amount,
      amountUnit: unit,
      managerEmpId: emp(manager),
      memo,
    };
    await prisma.corpAsset.upsert({ where: { id }, update: data, create: { id, ...data } });
    assets++;
  }

  // 지점 관리 기록
  let cases = 0;
  for (const [
    i,
    [branch, kind, status, occurred, due, assignee, amount, title, content],
  ] of CASES.entries()) {
    const branchId = orgId.get(branch);
    if (!branchId) continue;
    const id = fixedId(4, i + 1);
    const data = {
      branchId,
      kind,
      status,
      title,
      content,
      occurredAt: day(occurred),
      dueDate: due === null ? null : day(due),
      assigneeEmpId: emp(assignee),
      amount,
    };
    await prisma.branchCase.upsert({ where: { id }, update: data, create: { id, ...data } });
    cases++;
  }

  console.log(
    `[seed-demo-work] 공지 ${notices} · 팀 업무 ${tasks} · 계약·자산 ${assets} · 지점 관리 기록 ${cases}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
