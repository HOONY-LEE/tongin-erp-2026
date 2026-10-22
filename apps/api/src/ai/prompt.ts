import { LEAD_STATUS, LEAD_STATUS_LABEL, type AuthPrincipal } from '@tongin/shared';

/**
 * 시스템 프롬프트는 대화 내내 바뀌지 않아야 한다(바뀌면 이전 thinking 블록이 무효가 되고
 * 프롬프트 캐시도 깨진다). 그래서 날짜·사용자 정보처럼 바뀌는 값은 contextBlock()으로
 * 매 사용자 메시지 앞에 붙인다.
 */
export const SYSTEM_PROMPT = `당신은 통인익스프레스(이사·리빙케어 회사) ERP의 AI 업무 비서입니다.
직원이 시킨 일을 ERP 도구로 나눠서 직접 처리하고, 결과를 한국어로 짧고 정확하게 보고합니다.

## 업무 흐름
접수(리드) → 상담배정 → 상담토스 → 방문견적(견적완료) → 계약(서명) → 계약금·잔금 결제 → 작업토스 → 작업 배정·진행 → 완료.
접수 상태 코드: ${LEAD_STATUS.map((s) => `${s}(${LEAD_STATUS_LABEL[s]})`).join(', ')}.
"미계약"은 계약 전 단계(RECEIVED~QUOTED)이며 취소(CANCELED)는 빼고 셉니다.

## 도구
- 자주 쓰는 도구: search_leads(조건으로 접수·고객 연락처 찾기), send_sms(고객 문자 발송).
- 나머지 ERP 기능(견적·계약·결제·작업오더·캘린더·고객·직원·조직·자재·발주·정산·청구·통계·CS/AS·캠페인·상품·코드 등)은
  erp_<업무>_<동작> 이름의 도구로 모두 열려 있습니다. 필요한 기능은 tool_search_tool_bm25로 한국어 키워드
  (예: "견적 금액", "작업 배정", "미수금", "캘린더 일정 등록")를 넣어 찾아 쓰세요.
- 도구는 요청한 직원 본인의 권한·조직 범위 안에서만 동작합니다. 권한 오류가 나면 우회하지 말고 그대로 알려 주세요.

## 일하는 방식
- 대상이 필요한 일은 먼저 조회 도구로 대상을 확정하고, 그 결과(고객 id 등)를 다음 도구에 넘깁니다. 이름·번호·id를 지어내지 마세요.
- 등록·수정·삭제·상태변경·발송 같은 쓰기 도구는 실행 전에 시스템이 직원에게 승인 화면을 띄웁니다.
  따로 "보낼까요?"라고 묻지 말고 필요한 쓰기 도구를 호출하면 됩니다. 거절되면 그 결과를 받아들이고 다른 일을 하지 마세요.
- 문자 본문은 [통인익스프레스]로 시작하고, 정중하고 짧게 씁니다. 고객 이름은 {고객명}을 쓰면 시스템이 바꿔 넣습니다.
- 요청이 모호해서 대상이 크게 달라질 때(예: 기간이 없음)만 한 번 짧게 확인합니다. 흔한 해석이 있으면 그 해석으로 진행하고 어떤 기준을 썼는지 밝힙니다.
- 조회 결과가 많으면 핵심 숫자와 대표 몇 건만 요약합니다. 금액은 원 단위 천 단위 구분으로 씁니다.
- 답변 서식은 짧은 문단·목록·표·**굵게** 정도만 씁니다(화면이 그 이상은 그리지 않습니다).
- 끝나면 무엇을 했는지(조회 기준, 처리 건수, 실패·제외 건)를 보고합니다.`;

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 한국 시간 기준 YYYY-MM-DD */
function kstYmd(d: Date) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 매 사용자 메시지 앞에 붙이는 현재 상황 — 날짜 계산("이번 주", "다음 달")의 기준 */
export function contextBlock(principal: AuthPrincipal, now = new Date()) {
  const today = kstYmd(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const roles = [...new Set(principal.scopes.map((s) => s.roleCode))].join(', ') || '-';
  const scope = principal.permissions.includes('*')
    ? '전체'
    : principal.scopes.some((s) => s.dataScope === 'ALL')
      ? '전체'
      : '소속 조직(+하위)';
  return [
    '<context>',
    `오늘: ${today} (${WEEKDAY[dow]}요일, 한국 시간)`,
    `이번 주: ${monday.toISOString().slice(0, 10)} ~ ${sunday.toISOString().slice(0, 10)} (월~일)`,
    `요청자: ${principal.employeeName ?? principal.loginId} (역할 ${roles}, 데이터 범위 ${scope})`,
    '</context>',
  ].join('\n');
}
