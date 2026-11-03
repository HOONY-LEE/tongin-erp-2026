/**
 * 업무 분장 — 가맹팀(부서 '가맹') 41개 업무와 주 담당자, 쓰는 도구.
 * 가맹팀이 따로 만들어 쓰던 '가맹팀 업무 통합 대시보드'의 업무분장 표를 그대로 옮겼다.
 *
 *   pnpm --filter @tongin/api exec tsx prisma/seed-demo-duties.ts
 *
 * - '가맹' 부서에 업무 분장이 하나라도 있으면 건드리지 않는다(관리자가 고친 내용 보존).
 * - 담당자는 이름으로 찾는다(가맹 부서 직원). 없으면 담당자 없이 넣는다.
 * - 성과 평가 예시: 가맹 부서의 이번 분기 지표(직접 지표 3 + 자동 지표 2) — 실적은 그 대시보드 수치(2026.10.30 기준)
 */
import { PrismaClient } from '@prisma/client';
import { kpiPeriodOf } from '@tongin/shared';

const prisma = new PrismaClient();

type Cycle = 'ALWAYS' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ADHOC';
// [업무, 주 담당, 쓰는 도구, 주기]
const DUTIES: [string, string, string, Cycle?][] = [
  ['신규 가맹 대상업체 발굴(DB 확보)', '정철민', '신규가맹비서'],
  ['기존/신규 업체 문자발송', '정철민', '신규가맹비서'],
  ['인·아웃바운드 상담 기록', '정철민', '신규가맹비서', 'DAILY'],
  ['상담결과 작성 및 유지(업체관리)', '정철민', '신규가맹비서'],
  ['최신이사업체 소식 및 정부정책 확인', '정철민', '뉴스 이메일링 Agent', 'DAILY'],
  ['가맹계약 진행 관리', '정철민', '수기계약'],
  ['가맹비·보증금 입금 확인', '정철민', '관리팀 확인'],
  ['신규 교육계획 수립 및 지점 통보', '곽성수', '기존 파일', 'ADHOC'],
  ['CS 등록 및 사내 신규지점 안내', '곽성수', 'CS 수기 입력', 'ADHOC'],
  ['지점서류 스캔/파일 관리', '최봉준', '수작업'],
  ['지점리스트 최신화 및 팀 공유', '최봉준', '지점대장', 'MONTHLY'],
  ['초도자재 신청 접수 및 업체 통보', '최봉준', '자재관리 Agent', 'ADHOC'],
  ['자재 판매/배송/재고/발주 관리', '최봉준', '자재관리 Agent'],
  ['협력업체 발주 및 수수료 정산', '최봉준', '자재관리 Agent', 'MONTHLY'],
  ['차량도색·자재·유니폼 확인 / 평생번호 부여', '최봉준', '실제 확인', 'ADHOC'],
  ['이사현장 평가 일정 수립', '곽성수', '수기 확인', 'MONTHLY'],
  ['평가 결과 점검표 및 후속조치 문서 작성', '곽성수', '현장점검 Agent'],
  ['교육자료/링바인더/명단/이름표 제작', '곽성수', '수작업', 'ADHOC'],
  ['세미나 계획 수립 및 공문 발송', '김준영', '행사 문서', 'ADHOC'],
  ['세미나 참석 여부 확인', '최봉준', '수작업', 'ADHOC'],
  ['신규지점 간담회 운영 준비', '김준영', '행사 운영', 'ADHOC'],
  ['재계약 대상 검토 및 공문 발송', '김준영', '재계약 Agent', 'MONTHLY'],
  ['재계약 진행 현황 관리', '김준영', '재계약 Agent'],
  ['가맹해지 대상자 선정', '정철민', '영업진행경과', 'ADHOC'],
  ['가맹해지 정산서/통보문 작성', '김준영', '문서 작성', 'ADHOC'],
  ['전자계약 업로드 실태 확인', '곽성수', '전자계약서 Agent', 'WEEKLY'],
  ['전자계약 사용자 문의 응대', '곽성수', '전자계약서 Agent'],
  ['보험사고 접수 및 서류 확인', '김준영', '보험처리 Agent', 'ADHOC'],
  ['지출결의서/보험 비교표 작성', '김준영', '보험처리', 'ADHOC'],
  ['고객 컴플레인/소보원 대응', '김준영', 'AS처리 Agent'],
  ['징계위원회 서류 준비 및 통보', '김준영', '징계 문서', 'ADHOC'],
  ['불법영업/불법광고 모니터링', '곽성수', '불법영업 Agent'],
  ['CMS/상호사용료 입금 확인', '정철민', '관리팀 공유', 'MONTHLY'],
  ['미수 독촉문/상담 스크립트 작성', '정철민', '관리팀 공유', 'ADHOC'],
  ['밴드 공지사항 게시 및 초대', '최봉준', '밴드 운영'],
  ['소송 현황 업데이트 및 문서 초안 보조', '김준영', '소송업무 Agent'],
  ['지적재산권 현황 유지 및 등록 일정 관리', '정철민', '소송업무 Agent', 'QUARTERLY'],
  ['정보공개서 변경 등록 준비', '곽성수', '정보공개서', 'ADHOC'],
  ['일반 문서 발송/지점 증빙 최신화', '김준영', '문서관리'],
  ['카카오톡 채널관리(쇼츠·카드뉴스·문자)', '정철민', '가맹콘텐츠비서', 'WEEKLY'],
  ['지점홍보 영상 및 고객발송 홍보물 관리', '김준영', '지점홍보영상 Agent'],
];

async function main() {
  const org = await prisma.orgUnit.findFirst({ where: { name: '가맹', type: 'DEPT' } });
  if (!org) return console.log("업무 분장: '가맹' 부서가 없어 건너뜀");
  if (await prisma.duty.count({ where: { orgUnitId: org.id } }))
    return console.log('업무 분장: 가맹 부서에 이미 있어 건너뜀');
  const people = await prisma.employee.findMany({
    where: { orgUnitId: org.id, isActive: true },
    select: { id: true, name: true },
  });
  const byName = new Map(people.map((p) => [p.name, p.id]));
  await prisma.orgUnit.update({
    where: { id: org.id },
    data: {
      mission:
        org.mission ??
        '가맹점 모집·계약·재계약부터 교육·현장 점검·자재 지원·보험/AS·콘텐츠까지, 가맹점이 통인 브랜드로 영업할 수 있게 돕는다.',
    },
  });
  await prisma.duty.createMany({
    data: DUTIES.map(([title, owner, tool, cycle], i) => ({
      orgUnitId: org.id,
      title,
      ownerEmpId: byName.get(owner) ?? null,
      tool,
      cycle: cycle ?? 'ALWAYS',
      sortOrder: (i + 1) * 10,
    })),
  });
  console.log(`업무 분장: 가맹 부서에 ${DUTIES.length}개 넣음`);

  const period = kpiPeriodOf();
  const where = { scope_scopeId_period: { scope: 'ORG', scopeId: org.id, period } };
  if (!(await prisma.kpiSet.findUnique({ where })))
    await prisma.kpiSet.create({
      data: {
        scope: 'ORG',
        scopeId: org.id,
        period,
        metrics: [
          { key: 'custom:new-franchise', label: '신규 가맹', unit: '개점', target: 15, weight: 3 },
          { key: 'custom:econtract', label: '전자계약 업로드율', unit: '%', target: 95, weight: 2 },
          {
            key: 'custom:material',
            label: '자재 구매 지점 비율',
            unit: '%',
            target: 95,
            weight: 1,
          },
          { key: 'TASK_COMPLETION', target: 90, weight: 1 },
          { key: 'ATTENDANCE', target: 95, weight: 1 },
        ],
        actuals: { 'custom:new-franchise': 12, 'custom:econtract': 93, 'custom:material': 89.2 },
        note: '가맹팀 업무 대시보드(2026.10.30 기준) 수치를 옮겨 넣은 예시',
      },
    });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
