import { Injectable, Logger, RequestMethod, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator';
import { dtoToSchema, type JsonSchema } from './dto-schema';
import { ToolError, type AiTool, type ToolContext } from './ai-tool.types';

/**
 * ERP API 카탈로그 — 앱에 등록된 모든 컨트롤러 라우트를 AI 도구로 바꾼다.
 *
 * 새 API를 만들면 따로 손대지 않아도 AI가 쓸 수 있다. 도구는 사용자 본인의 토큰으로
 * 실제 HTTP API를 부르므로 권한 가드·조직 스코프·입력 검증·감사 로그가 화면에서 부를 때와
 * 똑같이 적용된다. 설명은 아래 DOMAIN/VERB 표로 만들고, 입력 스키마는 DTO에서 뽑는다.
 */

/** 컨트롤러 경로 → 업무 이름 + 검색어(tool search가 찾을 수 있게 키워드를 넉넉히) */
const DOMAIN: Record<string, string> = {
  leads:
    '접수(리드) — 고객 이사·청소 문의 접수 건. 상태: 접수·상담배정·상담토스·견적완료·계약·작업토스·작업중·완료·취소',
  estimates:
    '견적 — 접수 건의 방문견적. 물품(CBM 물량)·옵션·금액(이사비용·부가세·계약금·잔금)·작업조건',
  contracts: '계약 — 견적을 확정해 만든 계약서. 서명·계약금/잔금 결제',
  payments: '결제 — 계약금·잔금 결제(가상계좌) 입금 확인',
  'payment-confirmations': '입금확인 — 견적별 계약금·잔금 입금 확인 목록·처리',
  customers: '고객 — 고객 원장(이름·전화번호·주소·등급)',
  'work-orders': '작업오더 — 계약 후 이사 작업 지시. 배정(직원·전속업체)·시작·완료',
  field: '현장 — 현장 직원 본인에게 배정된 작업지시서',
  'service-orders': '서비스오더 — 리빙케어(청소·정리수납 등) 서비스 주문',
  'support-tickets': 'CS·AS — 고객 문의·불만·사후처리 티켓',
  calendar: '캘린더 — 일정(방문견적·이사·작업 등) 조회·등록',
  campaigns: '마케팅 캠페인 — 고객 등급별 단체 문자·알림톡 캠페인',
  notifications: '알림 발송 이력 — 알림톡·문자 발송 기록',
  employees: '직원 — 직원 마스터(소속 조직·직급·연락처)',
  'org-units': '조직 — 본사·지점·가맹점 조직도',
  branches: '지점 현황 — 지점별 실적 요약',
  accounts: '사용자 계정 — 로그인 계정·역할(권한) 관리',
  partners:
    '파트너 — 제휴사(회원 이사, 가맹점까지 배정)·전속 계약사(임직원 이사, 본사만 배정)·외주 작업업체·B2B 고객사. type=AFFILIATE·EXCLUSIVE·OUTSOURCE·B2B_CLIENT',
  products:
    '상품구성 — 가정이사·기업이전처럼 견적서에 대표로 보이는 묶음. 구성 상품(필수·기본선택·선택)과 구성별 단가',
  'addon-services':
    '상품 — 실제로 파는 것(이사물량·사다리차·입주청소·분해설치·보관 등). 견적 3단계 목록의 원본',
  'cbm-items': '이사물품 사전 — 가구·가전 물품별 기본 부피(CBM)·무게(톤)',
  'room-templates': '방 틀 — 견적 물품정보의 기본 방(안방·거실 …)과 방마다 자주 들어가는 이사물품',
  'handling-methods':
    '처리방법 — 운반·폐기·하역·경유·방치·업체 등과 물량 집계 칸(이사·경유·폐기·제외)',
  'price-conditions': '단가 조건 — 파트너별 할인·고정가 조건',
  'common-codes': '공통코드 — 접수경로 등 코드표',
  materials: '자재·재고 — 박스·테이프 등 자재와 입출고(수불)',
  'material-orders': '자재 발주 — 가맹점→본사 자재 발주·승인·출고',
  settlements: '정산 — 입금 내역·고객별 미수금·월별 입금·수수료 규칙·지점 정산',
  billing: '청구 — 외주비·마진·세금계산서(청구서)·파트너 미수',
  hr: '인사 — 인센티브·패널티 정책과 지급액 계산',
  stats: '통계 — 대시보드 KPI(접수·계약·매출 추이)·필터 매출 통계',
  'crm/:pipeline':
    '영업 CRM — pipeline=FRANCHISE(가맹 영업: 가맹점 모집) | B2B(기업영업: 기업이전 리드·견적·수주). 단계·유입 경로·담당별',
  geo: '주소 — 도로명주소를 좌표·시도/시군구로 변환',
  approvals:
    '결재 — 전자결재 문서(휴가·근태 정정·지출·구매 등 양식). 내 결재함(내 차례·내가 올린·참조)·승인·반려·상신',
  'approval-forms': '결재 양식 — 지출·구매·출장 등 결재 양식 목록·관리',
  'approval-attachments': '결재 첨부 — 결재 문서 첨부파일',
  leave: '휴가 — 연차·반차·경조 휴가 잔여·신청·현황',
  attendance: '근태 — 출퇴근 기록·지각·정정 신청·근무시간',
  tasks: '업무 — 팀 업무(작업관리) 등록·담당·진행 상태·댓글',
  notices: '공지 — 사내 공지사항',
  duties: '당직 — 당직·근무 편성',
  spaces: '공간 예약 — 회의실 등 공간 예약',
  drive: '드라이브 — 사내 파일 공간·폴더',
  dashboards: '대시보드 — 대시보드 화면 구성',
  'custom-widgets': '위젯 — 위젯 스튜디오에서 만든 위젯',
  kpi: 'KPI — 성과 지표·목표',
  franchise: '가맹 — 가맹점 계약 정보(가맹비·보증금·계약 기간)',
  'branch-cases': '지점 관리 기록 — 지점별 관리·점검 기록',
  'move-closures': '이사 마감 — 지점별 날짜 마감(꽉 찬 날)',
  'cs-followups': '상담 후속 — 콜백·확인콜·해피콜 할 일',
  'cs-memo-presets': '상담 메모 문구 — 상담 메모 자주 쓰는 문구',
  'cs-sms': '상담 문자 — 상담 콘솔 문자 발송 이력',
  'me/notifications': '내 알림 — 나에게 온 알림',
  menus: '메뉴 — 사이드바 메뉴 구성',
  positions: '직책 — 직책·직급 목록',
  roles: '역할 — 권한 묶음(역할) 목록·관리',
  'system-logs': '시스템 기록 — 감사 로그',
  assets: '자산 — 회사 자산(장비·차량 등)',
  agents: 'AI 에이전트 — 만들어 둔 에이전트 부르기',
  'agent-suggestions': '에이전트 제안 — 반복 업무 자동화 제안',
};

const VERB: Record<string, string> = {
  findAll: '목록 조회',
  list: '목록 조회',
  findOne: '상세 조회',
  detail: '상세 조회',
  create: '신규 등록',
  update: '수정',
  remove: '삭제',
  transition: '상태 변경(정해진 순서로만)',
};

/** 이름만으로 뜻이 모호한 라우트 설명 */
const OVERRIDE: Record<string, string> = {
  'leads.caseView': '접수 한 건의 전체 여정 — 고객·견적·계약·결제·작업·CS 이력을 한 번에 조회',
  'estimates.quote': '견적 확정 — 견적을 확정 상태로 바꾸고 접수 상태를 견적완료로 넘긴다',
  'estimates.document': '견적서 문서 데이터 조회(견적서 화면·PDF에 쓰는 형태)',
  'estimates.saveBasic': '견적 1단계 기본정보 저장(이사종류·주소·상담일·이사일)',
  'estimates.updateConditions': '견적 작업조건 저장(출발·도착지 층수·엘리베이터/사다리 등)',
  'estimates.updateAmounts': '견적 금액 저장(이사비용·부가세·계약금·잔금)',
  'estimates.getBuildup': '견적 원가 구성(인건비·차량·자재) 조회',
  'estimates.setBuildup': '견적 원가 구성 저장',
  'estimates.deductMaterials': '견적에 쓰인 자재를 재고에서 차감',
  'contracts.sign': '계약 서명 처리 — 계약 내용을 동결하고 접수 상태를 계약으로 넘긴다',
  'contracts.listPayments': '계약의 결제(계약금·잔금) 목록',
  'contracts.createPayment': '계약에 결제(가상계좌) 생성',
  'payments.confirm': '결제 입금 확인 처리',
  'payment-confirmations.confirmDeposit': '견적의 계약금 입금 확인',
  'payment-confirmations.confirmBalance': '견적의 잔금 입금 확인',
  'work-orders.addAssignment': '작업오더에 직원·전속업체 배정',
  'work-orders.start': '작업 시작 처리',
  'work-orders.complete': '작업 완료 처리',
  'field.start': '현장 작업 시작',
  'field.complete': '현장 작업 완료',
  'campaigns.preview': '캠페인 발송 대상 미리보기(받을 고객 수·목록)',
  'campaigns.send': '캠페인 발송 — 대상 고객 전원에게 문자·알림톡 발송',
  'calendar.orgUnits': '캘린더에서 고를 수 있는 조직 목록',
  'calendar.googleStatus': '구글 캘린더 연동 상태',
  'calendar.googleSync': '구글 캘린더와 동기화',
  'calendar.googleDisconnect': '구글 캘린더 연동 해제',
  'branches.overview':
    '모든 지점의 실적을 한 번에 — 지점별 접수 건수·계약 건수·계약 매출·완료 작업·진행 중 작업·직원 수. from·to(YYYY-MM-DD, 한국 날짜, 둘 다 포함)로 기간을 정하면 그 기간 실적(지난주·지난달 보고서에 이것을 쓴다), 비우면 전체 기간',
  'stats.overview': '대시보드 통계 요약(기간별 접수·계약·매출)',
  'settlements.payments': '입금 내역 조회(기간·지점 필터)',
  'settlements.receivables': '고객별 미수금(청구 − 입금)',
  'settlements.monthly': '월별 입금액',
  'settlements.listRules': '수수료 규칙 목록',
  'settlements.createRule': '수수료 규칙 등록',
  'settlements.updateRule': '수수료 규칙 수정',
  'settlements.removeRule': '수수료 규칙 삭제',
  'stats.sales':
    '매출 통계(필터) — 기간(from·to YYYY-MM-DD)·상품 종류(serviceLine: B2B_MOVING=기업이전, MOVING=가정이사 …)·지점(orgUnitId)·거래처(partnerId)·접수 경로(source)로 거르고 groupBy(day·week·month·branch·partner·serviceLine·source·region)로 묶어 접수·계약 건수·계약 매출·전환율을 낸다. 기업이전 매출·거래처별 실적·월별 추이는 이걸 쓴다',
  'crm/:pipeline.list':
    '영업 대상 목록 — stage·ownerEmpId·source·q(이름·연락처 검색)·from·to(등록일)로 거른다',
  'crm/:pipeline.stats':
    '영업 파이프라인 통계 — 전체·진행 중·수주(계약)·실패·수주율·수주 금액·진행 중 금액, 단계별·유입 경로별·담당자별. from·to·ownerEmpId·source로 거른다',
  'crm/:pipeline.one': '영업 대상 한 건과 상담 기록(통화·문자·미팅·단계 변경)',
  'settlements.branch':
    '지점 한 곳의 월 정산(계약별 수수료) — orgUnitId(지점 id)·year·month 필수. 여러 지점 실적 비교·주간 보고에는 쓰지 말고 branches.overview를 쓴다',
  'billing.setOutsourceCost': '작업오더 외주비 입력',
  'billing.margins': '작업별 마진(매출 − 외주비)',
  'billing.listInvoices': '청구서 목록',
  'billing.createInvoice': '청구서 작성',
  'billing.issueInvoice': '청구서 발행',
  'billing.addReceipt': '청구서 수금 등록',
  'billing.partnerReceivables': '파트너별 미수금',
  'hr.payout': '인센티브·패널티 지급액 계산(연·월·대상)',
  'materials.createMovement': '자재 입고·출고(수불) 기록',
  'material-orders.approve': '자재 발주 승인',
  'material-orders.ship': '자재 발주 출고',
  'material-orders.cancel': '자재 발주 취소',
  'products.addAddon': '상품구성에 상품 하나 추가',
  'products.removeAddon': '상품구성에서 상품 하나 빼기',
  'products.setItems': '상품구성 전체 저장(필수·기본선택·선택, 구성 단가, 순서)',
  'room-templates.setItems': '방 틀의 물품 목록 전체 저장(순서대로)',
  'estimates.saveItems':
    '견적 2단계 물품정보 저장(방별 물품·CBM 또는 톤·처리방법, CBM/톤 견적 선택) — 방 목록 전체를 교체',
  'estimates.saveOptions':
    '견적 3단계 저장(작업조건 + 구성 상품·추가 상품) — 필수 상품은 빠질 수 없다',
  'accounts.roles': '역할 목록',
  'geo.geocode': '도로명주소 → 좌표·시도/시군구',
  'approvals.list':
    "결재함 목록 — box: todo(지금 내가 결재할 차례, 기본)·mine(내가 올린 문서)·cc(참조·이미 결재한 문서)·all(전체). '결재할 것·승인 대기'는 box=todo",
  'approvals.get': '결재 문서 한 건 상세(내용·결재선·현재 결재자)',
  'approvals.act':
    '결재 처리 — 내 차례인 문서를 승인(APPROVE) 또는 반려(REJECT), 의견(comment) 선택',
  'approvals.cancel': '내가 올린 결재 문서 회수(아직 아무도 승인하지 않았을 때)',
  'approvals.submit': '품의(일반 결재) 상신',
  'approvals.pendingCount': '내 결재 차례 건수',
};

/** 조회 조건의 허용 값·뜻 — 모델이 값을 짐작해 400이 나지 않게 */
const PARAM_HINT: Record<string, Record<string, JsonSchema>> = {
  'approvals.list': {
    box: {
      type: 'string',
      enum: ['todo', 'mine', 'cc', 'all'],
      description:
        'todo=지금 내가 결재할 차례(기본) · mine=내가 올린 문서 · cc=참조·이미 결재한 문서 · all=전체',
    },
    f: { type: 'string', description: '화면 필터용 — 비워 둔다' },
    q: { type: 'string', description: '제목·문서 번호·기안자 검색어(선택)' },
  },
};

/** 승인 카드에 보일 동작 이름 */
const ACTION_WORD: Record<string, string> = { APPROVE: '승인', REJECT: '반려' };

/** AI에게 열지 않는 라우트 — 로그인·OAuth 콜백·파일 내보내기·AI 자기 자신 */
// knowledge: AI는 search_knowledge · read_knowledge(업무 도구)로 쓴다
const EXCLUDED_CONTROLLERS = new Set([
  'auth',
  'ai',
  // 개발자 메뉴(도구 목록·시험 실행)는 사람이 쓰는 화면
  'dev',
  'agent-blueprints',
  'agent-runs',
  'knowledge',
  // 상담 콘솔(콜 받기·콜백)은 사람이 전화로 하는 일
  'cs-calls',
  '',
]);
const EXCLUDED_ROUTES = new Set([
  'calendar.googleAuthUrl',
  'calendar.googleCallback',
  'calendar.workOrders',
  // 드라이브: 파일 바이트를 주고받는 것·구글 계정 연결은 AI가 부를 일이 아니다
  'drive.upload',
  'drive.content',
  'drive.googleAuthUrl',
  'drive.googleDisconnect',
  'drive.emptyTrash',
]);
/** GET이 아니어도 데이터를 바꾸지 않는 라우트 */
const READ_ONLY_POSTS = new Set(['geo.geocode']);

const METHOD_NAME: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

interface RouteArg {
  index: number;
  data?: string;
  /** @Query('x', ParseUUIDPipe) 처럼 붙은 파이프 — 있으면 그 값은 꼭 넣어야 한다 */
  pipes?: unknown[];
}
/** 값이 없으면 400을 내는 파이프(필수 값) — 이름으로 본다(Optional 옵션이 켜진 것은 제외) */
const isRequiredPipe = (p: unknown) => {
  const name =
    typeof p === 'function'
      ? p.name
      : (p as { constructor?: { name?: string } })?.constructor?.name;
  const optional = !!(p as { options?: { optional?: boolean } } | null)?.options?.optional;
  return !optional && /^Parse(UUID|Int|Float|Bool|Enum)Pipe$/.test(name ?? '');
};

/** 도구 이름은 영문·숫자·_·-만 된다(Claude API 규칙) — 'me/notifications'의 '/'처럼 다른 글자는 _로 */
const snake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase();

@Injectable()
export class ApiCatalog implements OnApplicationBootstrap {
  private readonly logger = new Logger('AiApiCatalog');
  private tools: AiTool[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap() {
    this.tools = this.build();
    this.logger.log(`ERP API 도구 ${this.tools.length}개 등록`);
  }

  list(): AiTool[] {
    return this.tools;
  }

  private build(): AiTool[] {
    const out: AiTool[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const metatype = wrapper.metatype as (new (...a: unknown[]) => unknown) | undefined;
      if (!metatype || !wrapper.instance) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '').replace(
        /^\/|\/$/g,
        '',
      );
      if (EXCLUDED_CONTROLLERS.has(base)) continue;
      const classPerms: string[] = Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, metatype) ?? [];
      const proto = Object.getPrototypeOf(wrapper.instance) as Record<string, unknown>;

      for (const handlerName of this.scanner.getAllMethodNames(proto)) {
        const handler = proto[handlerName] as object;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (method === undefined || sub === undefined) continue;
        const key = `${base}.${handlerName}`;
        if (EXCLUDED_ROUTES.has(key)) continue;
        if (Reflect.getMetadata(IS_PUBLIC_KEY, handler)) continue;
        const httpMethod = METHOD_NAME[method];
        if (!httpMethod) continue;
        const tool = this.toTool({
          base,
          sub: sub.replace(/^\/|\/$/g, ''),
          handlerName,
          httpMethod,
          metatype,
          proto,
          permissions: Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler) ?? classPerms,
        });
        if (tool) out.push(tool);
      }
    }
    return out;
  }

  private toTool(r: {
    base: string;
    sub: string;
    handlerName: string;
    httpMethod: string;
    metatype: new (...a: unknown[]) => unknown;
    proto: object;
    permissions: string[];
  }): AiTool | null {
    const key = `${r.base}.${r.handlerName}`;
    const path = [r.base, r.sub].filter(Boolean).join('/');
    const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, r.metatype, r.handlerName) ??
      {}) as Record<string, RouteArg>;
    const paramTypes = (Reflect.getMetadata('design:paramtypes', r.proto, r.handlerName) ??
      []) as unknown[];

    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    const pathParams: string[] = [];
    const queryParams: string[] = [];
    let bodyMode: 'none' | 'whole' | 'fields' = 'none';
    const bodyFields: string[] = [];

    for (const [k, arg] of Object.entries(args)) {
      const type = Number(k.split(':')[0]);
      const designType = paramTypes[arg.index];
      if (type === RouteParamtypes.PARAM && arg.data) {
        properties[arg.data] = { type: 'string', description: `경로 값 :${arg.data} (보통 UUID)` };
        required.push(arg.data);
        pathParams.push(arg.data);
      } else if (type === RouteParamtypes.QUERY) {
        if (arg.data) {
          const must = (arg.pipes ?? []).some(isRequiredPipe);
          properties[arg.data] = PARAM_HINT[key]?.[arg.data] ?? {
            type: designType === Number ? 'number' : 'string',
            description: must ? '꼭 넣어야 하는 값' : '조회 조건(선택)',
          };
          if (must) required.push(arg.data);
          queryParams.push(arg.data);
        } else if (typeof designType === 'function' && designType !== Object) {
          const s = dtoToSchema(designType as new () => unknown);
          for (const [p, ps] of Object.entries(s.properties ?? {})) {
            properties[p] = ps;
            queryParams.push(p);
          }
        }
      } else if (type === RouteParamtypes.BODY) {
        if (arg.data) {
          bodyMode = 'fields';
          bodyFields.push(arg.data);
          properties[arg.data] = { type: designType === Number ? 'number' : 'string' };
          required.push(arg.data);
        } else if (typeof designType === 'function' && designType !== Object) {
          bodyMode = 'whole';
          const s = dtoToSchema(designType as new () => unknown);
          properties.body = { ...s, description: '요청 본문' };
          if (s.required?.length) required.push('body');
        }
      }
    }

    const mode = r.httpMethod === 'GET' || READ_ONLY_POSTS.has(key) ? 'READ' : 'WRITE';
    const domain = DOMAIN[r.base] ?? r.base;
    const verb = OVERRIDE[key] ?? VERB[r.handlerName] ?? r.handlerName;
    const description =
      `[${domain.split(' — ')[0]}] ${verb}. ${domain}. ` +
      `(${r.httpMethod} /${path}${r.permissions.length ? ` · 권한 ${r.permissions.join(',')}` : ''}` +
      `${mode === 'WRITE' ? ' · 실행 전 사용자 승인 필요' : ''})` +
      `\n검색어: ${keywords(domain, verb, path, r.handlerName)}`;

    return {
      name: `erp_${snake(r.base)}_${snake(r.handlerName)}`.slice(0, 64),
      description,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      },
      mode,
      group: domain.split(' — ')[0],
      endpoint: `${r.httpMethod} /${path}`,
      permissions: r.permissions,
      deferred: true,
      summarize: (input) => friendlySummary(verb, input),
      ...(mode === 'WRITE'
        ? {
            preview: (input: Record<string, unknown>, ctx: ToolContext) =>
              PREVIEW[key]
                ? PREVIEW[key](input, ctx)
                : Promise.resolve(genericPreview(domain.split(' — ')[0], verb, input)),
          }
        : {}),
      run: (input, ctx) =>
        callApi(ctx, r.httpMethod, fillPath(path, input), {
          query: pick(input, queryParams),
          body:
            bodyMode === 'whole'
              ? (input.body ?? {})
              : bodyMode === 'fields'
                ? pick(input, bodyFields)
                : undefined,
        }),
    };
  }
}

/** 승인 카드 미리보기 — 무엇을 하는지 사람이 읽는 말로(실행은 하지 않는다) */
export interface ActionPreview {
  kind: 'action';
  /** 동작(승인·반려·등록·수정 …) */
  verb: string;
  tone: 'primary' | 'danger' | 'neutral';
  title: string;
  fields: { label: string; value: string }[];
  /** 확인할 점(예: 지금 내 차례가 아님) */
  note?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

/** 승인 카드 한 줄 요약 — 'POST /approvals/…/act' 대신 '결재 처리 — 승인' */
function friendlySummary(verb: string, input: Record<string, unknown>) {
  const head = verb.split(' — ')[0].split('(')[0].trim();
  const body = (input.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? ACTION_WORD[body.action] : undefined;
  return action ? `${head} — ${action}` : head;
}

/** 알맞은 미리보기가 없는 쓰기 — 넣을 값을 '이름: 값'으로(id는 빼고) */
function genericPreview(
  domain: string,
  verb: string,
  input: Record<string, unknown>,
): ActionPreview {
  const flat: { label: string; value: string }[] = [];
  const walk = (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'string' && UUID_RE.test(v)) continue;
      if (k === 'body' && v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>);
        continue;
      }
      flat.push({ label: k, value: short(v) });
    }
  };
  walk(input);
  return {
    kind: 'action',
    verb: verb.split(' — ')[0].split('(')[0].trim(),
    tone: /삭제|취소|반려/.test(verb) ? 'danger' : 'primary',
    title: domain,
    fields: flat.slice(0, 12),
  };
}

const fmtDate = (v: unknown) =>
  typeof v === 'string' || v instanceof Date
    ? new Date(v).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

/** 라우트별 미리보기 — 대상 문서를 읽어 사람이 알아보게 */
const PREVIEW: Record<
  string,
  (input: Record<string, unknown>, ctx: ToolContext) => Promise<ActionPreview>
> = {
  'approvals.act': async (input, ctx) => {
    const doc = (await callApi(ctx, 'GET', fillPath('approvals/:id', input), {})) as {
      docNo: string;
      docTypeLabel: string;
      title: string;
      content?: string | null;
      submittedAt?: string;
      requester?: { name: string; positionName?: string | null; orgUnitName?: string | null };
      canAct?: boolean;
    };
    const body = (input.body ?? {}) as { action?: string; comment?: string };
    const reject = body.action === 'REJECT';
    const who = doc.requester
      ? [doc.requester.name, doc.requester.positionName, doc.requester.orgUnitName]
          .filter(Boolean)
          .join(' · ')
      : '';
    return {
      kind: 'action',
      verb: `결재 ${ACTION_WORD[body.action ?? ''] ?? '처리'}`,
      tone: reject ? 'danger' : 'primary',
      title: doc.title,
      fields: [
        { label: '문서 종류', value: doc.docTypeLabel },
        { label: '문서 번호', value: doc.docNo },
        ...(who ? [{ label: '기안자', value: who }] : []),
        ...(doc.submittedAt ? [{ label: '올린 때', value: fmtDate(doc.submittedAt) }] : []),
        ...(doc.content ? [{ label: '내용', value: short(doc.content) }] : []),
        ...(body.comment ? [{ label: '의견', value: body.comment }] : []),
      ],
      ...(doc.canAct === false ? { note: '지금 내 결재 차례가 아닌 문서입니다.' } : {}),
    };
  },
};

/**
 * tool search(BM25)는 띄어쓰기로 낱말을 나눈다 — "미수금(청구"처럼 문장부호에 붙은 낱말은
 * "미수금"으로 찾히지 않는다. 설명의 낱말·경로·동작 이름을 깨끗이 쪼개 한 줄로 덧붙인다.
 */
function keywords(...parts: string[]) {
  const words = parts
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^0-9A-Za-z가-힣]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));
  return [...new Set(words)].join(' ');
}

function fillPath(path: string, input: Record<string, unknown>) {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, p: string) => {
    const v = String(input[p] ?? '');
    // '..'·'.'·빈 값은 주소를 거슬러 올라가 AI에 열지 않은 API(인증·AI 관리 등)에 닿는다
    if (!v || v === '.' || v === '..') throw new Error(`${p} 값이 올바르지 않습니다.`);
    return encodeURIComponent(v);
  });
}

function pick(input: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (input[k] !== undefined && input[k] !== null) out[k] = input[k];
  return out;
}

const API_BASE = () => `http://127.0.0.1:${process.env.PORT ?? 3001}/api`;

/** 사용자 본인 토큰으로 ERP API를 부른다 — 권한·스코프·검증·감사가 화면과 동일하게 걸린다 */
async function callApi(
  ctx: ToolContext,
  method: string,
  path: string,
  opts: { query?: Record<string, unknown>; body?: unknown },
): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) qs.set(k, String(v));
  const url = `${API_BASE()}/${path}${qs.size ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: ctx.authorization,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'X-Requested-By': 'ai-assistant',
    },
    body: opts.body !== undefined && method !== 'GET' ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON이 아니면 원문 그대로
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? [(data as { message: unknown }).message].flat().join(', ')
        : String(text).slice(0, 300);
    throw new ToolError(`API ${res.status}: ${msg}`);
  }
  return data;
}
