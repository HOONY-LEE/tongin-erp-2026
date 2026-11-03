/**
 * 영업 CRM 시연 데이터(추가 시드, 한 번만) — 가맹 고객관리·기업영업 CRM에 리드·상담·계약 단계별 대상과 상담 기록.
 * 그 파이프라인에 대상이 이미 있으면 건너뛴다(운영 데이터 보존).
 * 영업 담당은 가맹팀(DEPT-FRAN)·기업영업팀(DEPT-B2B) 직원 중에서 돌려 가며 맡긴다.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const day = (n: number) => new Date(Date.now() + n * DAY);
const ymd = (n: number) => new Date(`${day(n).toISOString().slice(0, 10)}T00:00:00Z`);

interface L {
  company: string;
  contact: string;
  title?: string;
  phone: string;
  email?: string;
  region: string;
  source: string;
  stage: string;
  interest: 'A' | 'B' | 'C';
  amount?: number;
  expected?: number;
  next?: [number, string];
  memo?: string;
  lostReason?: string;
  fields?: Record<string, string | number>;
  /** 상담 기록: [며칠 전, 종류, 내용] */
  acts: [number, string, string][];
}

const FRANCHISE: L[] = [
  {
    company: '한빛익스프레스',
    contact: '정우성',
    phone: '01067890123',
    region: '경기 화성',
    source: 'INBOUND',
    stage: 'NEW',
    interest: 'A',
    amount: 30_000_000,
    next: [1, '가맹 설명 자료 보내기'],
    fields: { currentBiz: '개인 이사업체 3년', trucks: 2 },
    acts: [[1, 'MEMO', '홈페이지 가맹 문의로 들어옴. 화성 동탄 권역 희망']],
  },
  {
    company: '박준형(개인)',
    contact: '박준형',
    phone: '01045678901',
    region: '인천 연수',
    source: 'DB',
    stage: 'CONTACTED',
    interest: 'C',
    amount: 30_000_000,
    next: [5, '재연락'],
    fields: { currentBiz: '화물 기사', trucks: 1, capital: '3천만 원' },
    acts: [[6, 'CALL', '창업 자금이 부족해 고민 중. 다음 달 다시 연락 요청']],
  },
  {
    company: '스마트이사',
    contact: '이수진',
    phone: '01034567890',
    region: '대전 유성',
    source: 'REFERRAL',
    stage: 'CONTACTED',
    interest: 'B',
    amount: 30_000_000,
    next: [2, '본사 방문 일정 잡기'],
    fields: { currentBiz: '용달 운영', trucks: 3 },
    acts: [
      [3, 'CALL', '대전 가맹점 소개로 연결. 수수료 구조 질문'],
      [2, 'SMS', '가맹 안내서 문자 발송'],
    ],
  },
  {
    company: '테크노무빙',
    contact: '김민수',
    phone: '01023456789',
    region: '서울 송파',
    source: 'EXPO',
    stage: 'CONSULTING',
    interest: 'A',
    amount: 35_000_000,
    next: [3, '지역 독점 범위 답변'],
    fields: { currentBiz: '이삿짐센터 7년', trucks: 5, capital: '1억 원' },
    acts: [
      [12, 'MEETING', '창업 박람회 상담 — 송파·강동 권역 원함'],
      [4, 'CALL', '지역 독점 범위와 초도 자재 비용 문의'],
    ],
  },
  {
    company: '그린리빙',
    contact: '장동건',
    phone: '01078901235',
    region: '부산 해운대',
    source: 'INBOUND',
    stage: 'MEETING',
    interest: 'A',
    amount: 30_000_000,
    expected: 45,
    next: [4, '부산 현장 방문'],
    fields: { currentBiz: '청소·정리수납', trucks: 2 },
    acts: [
      [9, 'CALL', '리빙케어 결합 상품에 관심'],
      [3, 'MEETING', '본사 방문 미팅 — 교육 일정 안내'],
    ],
  },
  {
    company: '고은비 물류',
    contact: '고은비',
    phone: '01089012346',
    region: '광주 서구',
    source: 'OUTBOUND',
    stage: 'CONTRACTING',
    interest: 'A',
    amount: 30_000_000,
    expected: 20,
    next: [2, '계약서 초안 검토 회신'],
    fields: { currentBiz: '화물 운송', trucks: 4, capital: '6천만 원' },
    acts: [
      [20, 'CALL', '아웃바운드 첫 통화'],
      [10, 'MEETING', '광주 현장 미팅'],
      [2, 'EMAIL', '가맹 계약서 초안 전달'],
    ],
  },
  {
    company: '송강호 이사',
    contact: '송강호',
    phone: '01023456781',
    region: '경기 수원',
    source: 'REFERRAL',
    stage: 'WON',
    interest: 'A',
    amount: 30_000_000,
    fields: { currentBiz: '이삿짐센터', trucks: 6 },
    acts: [
      [40, 'MEETING', '수원 지역 상담'],
      [15, 'MEMO', '가맹 계약 체결 — 교육 일정 확정'],
    ],
  },
  {
    company: '이병헌 익스프레스',
    contact: '이병헌',
    phone: '01012345680',
    region: '충남 천안',
    source: 'EXPO',
    stage: 'WON',
    interest: 'B',
    amount: 28_000_000,
    fields: { currentBiz: '용달', trucks: 3 },
    acts: [
      [60, 'MEETING', '박람회 상담'],
      [30, 'MEMO', '계약 완료(가맹비 할인 2백만 원)'],
    ],
  },
  {
    company: '세움운송',
    contact: '최민식',
    phone: '01055556666',
    region: '대구 수성',
    source: 'DB',
    stage: 'LOST',
    interest: 'C',
    amount: 30_000_000,
    lostReason: '다른 브랜드 가맹 선택',
    acts: [
      [25, 'CALL', '경쟁사와 비교 중'],
      [8, 'CALL', '타사로 결정했다고 연락'],
    ],
  },
];

const B2B: L[] = [
  {
    company: '패션트렌드',
    contact: '정우성',
    title: '총무팀 과장',
    phone: '01067890123',
    email: 'ws.jung@fashiontrend.kr',
    region: '서울 성수',
    source: 'INBOUND',
    stage: 'LEAD',
    interest: 'A',
    amount: 45_000_000,
    next: [2, '현장 실사 일정 제안'],
    fields: { industry: '패션·유통', employees: 80, area: 400, moveScope: '사무실 전체' },
    acts: [[1, 'MEMO', '홈페이지 기업이전 문의']],
  },
  {
    company: '글로벌물류',
    contact: '박준형',
    title: '경영지원 팀장',
    phone: '01045678901',
    region: '경기 김포',
    source: 'OUTBOUND',
    stage: 'CONTACTED',
    interest: 'C',
    amount: 120_000_000,
    next: [7, '재연락'],
    fields: { industry: '물류', employees: 150, moveScope: '공장·창고' },
    acts: [[5, 'CALL', '내년 상반기 이전 검토 중']],
  },
  {
    company: '스마트헬스케어',
    contact: '이수진',
    title: '총무 대리',
    phone: '01034567890',
    email: 'sj.lee@smarthc.com',
    region: '서울 강남',
    source: 'BID',
    stage: 'SURVEY',
    interest: 'B',
    amount: 68_000_000,
    expected: 40,
    next: [3, '실사 결과로 견적서 작성'],
    fields: {
      industry: '의료기기',
      employees: 120,
      area: 650,
      moveScope: '연구소·실험실',
      decisionMaker: '경영지원본부장',
      competitor: 'A사',
    },
    acts: [
      [14, 'MEETING', '입찰 설명회 참석'],
      [3, 'MEETING', '현장 실사 — 실험 장비 특수 포장 필요'],
    ],
  },
  {
    company: '미디어콘텐츠',
    contact: '장동건',
    title: 'IT 인프라 팀장',
    phone: '01078901235',
    email: 'dg.jang@mediacontent.com',
    region: '서울 상암',
    source: 'REFERRAL',
    stage: 'QUOTED',
    interest: 'A',
    amount: 200_000_000,
    expected: 30,
    next: [2, '견적 회신 확인'],
    fields: {
      industry: '방송·콘텐츠',
      employees: 300,
      area: 1500,
      moveScope: '전산·서버',
      decisionMaker: '대표이사',
    },
    acts: [
      [21, 'MEETING', '기존 고객 소개로 미팅'],
      [9, 'MEETING', '서버실 실사'],
      [4, 'EMAIL', '견적서 2억 원 제출'],
    ],
  },
  {
    company: '테크노베이션',
    contact: '김민수',
    title: '총무팀장',
    phone: '01023456789',
    region: '경기 판교',
    source: 'EXISTING',
    stage: 'NEGOTIATING',
    interest: 'A',
    amount: 95_000_000,
    expected: 25,
    next: [1, '단가 조정안 회신'],
    fields: {
      industry: 'IT',
      employees: 200,
      area: 900,
      moveScope: '사무실 전체',
      competitor: 'B사',
    },
    acts: [
      [30, 'MEETING', '재계약 상담'],
      [6, 'CALL', '경쟁사 대비 단가 조정 요청'],
    ],
  },
  {
    company: '한국정밀',
    contact: '송강호',
    title: '관리부장',
    phone: '01023456781',
    region: '충북 청주',
    source: 'BID',
    stage: 'WON',
    interest: 'A',
    amount: 750_000_000,
    fields: { industry: '제조', employees: 450, moveScope: '공장·창고' },
    acts: [
      [60, 'MEETING', '입찰'],
      [20, 'MEMO', '수주 확정 — 3주에 걸쳐 단계 이전'],
    ],
  },
  {
    company: '에이스금융',
    contact: '이병헌',
    title: '총무 차장',
    phone: '01012345680',
    region: '서울 여의도',
    source: 'PARTNER',
    stage: 'WON',
    interest: 'B',
    amount: 500_000_000,
    fields: { industry: '금융', employees: 260, moveScope: '일부 층·부서' },
    acts: [
      [45, 'MEETING', '제휴사 소개 미팅'],
      [12, 'MEMO', '수주 확정'],
    ],
  },
  {
    company: '바이오랩',
    contact: '전도연',
    title: '연구지원 팀장',
    phone: '01099998888',
    region: '인천 송도',
    source: 'INBOUND',
    stage: 'HOLD',
    interest: 'B',
    amount: 80_000_000,
    lostReason: '이전 일정 내년으로 연기',
    fields: { industry: '바이오', moveScope: '연구소·실험실' },
    acts: [[18, 'CALL', '이전 일정이 내년으로 밀렸다고 함']],
  },
];

async function seed(pipeline: 'FRANCHISE' | 'B2B', list: L[], dept: string) {
  if (await prisma.crmLead.count({ where: { pipeline } })) {
    console.log(`영업 CRM ${pipeline} — 이미 있음(건너뜀)`);
    return;
  }
  const owners = await prisma.employee.findMany({
    where: { orgUnit: { code: dept }, isActive: true },
    select: { id: true, name: true },
    take: 4,
  });
  for (const [i, l] of list.entries()) {
    const owner = owners.length ? owners[i % owners.length] : null;
    const lead = await prisma.crmLead.create({
      data: {
        pipeline,
        companyName: l.company,
        contactName: l.contact,
        contactTitle: l.title ?? null,
        phone: l.phone,
        email: l.email ?? null,
        region: l.region,
        source: l.source,
        stage: l.stage,
        interest: l.interest,
        ownerEmpId: owner?.id ?? null,
        amount: l.amount ?? null,
        expectedAt: l.expected ? ymd(l.expected) : null,
        nextActionAt: l.next ? ymd(l.next[0]) : null,
        nextAction: l.next?.[1] ?? null,
        memo: l.memo ?? null,
        lostReason: l.lostReason ?? null,
        fields: l.fields ?? {},
        createdAt: day(-Math.max(...l.acts.map((a) => a[0])) - 1),
      },
    });
    for (const [ago, kind, content] of l.acts)
      await prisma.crmActivity.create({
        data: { leadId: lead.id, kind, content, actorName: owner?.name ?? '시스템', at: day(-ago) },
      });
  }
  console.log(`영업 CRM ${pipeline} — ${list.length}건 넣음`);
}

async function main() {
  await seed('FRANCHISE', FRANCHISE, 'DEPT-FRAN');
  await seed('B2B', B2B, 'DEPT-B2B');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
