import { BadRequestException, type ValidationError } from '@nestjs/common';

/**
 * 입력 검증 오류를 화면에 그대로 보여 줄 수 있는 한국어 문장으로 바꾼다.
 * (기본 메시지는 'moveDate must be a valid ISO 8601 date string' 같은 영어라 직원이 알아보기 어렵다)
 */
const FIELD_LABEL: Record<string, string> = {
  orgUnitId: '담당 지점',
  ownerEmpId: '담당자',
  customerId: '고객',
  customerName: '고객명',
  customerPhone: '연락처',
  phonePrimary: '연락처',
  partnerId: '거래처',
  productId: '상품',
  serviceLine: '상품 종류',
  source: '접수경로',
  moveDate: '이사일',
  visitDate: '방문견적일',
  scheduledDate: '작업일',
  scheduledAt: '예약 시각',
  serviceDate: '서비스 요청일',
  contractDate: '계약일',
  fromPyeong: '출발지 평수',
  toPyeong: '도착지 평수',
  fromAccess: '출발지 작업조건',
  toAccess: '도착지 작업조건',
  moveAmount: '이사비용',
  vatAmount: '부가세',
  depositAmount: '계약금',
  balanceAmount: '잔금',
  totalAmount: '총액',
  amount: '금액',
  cbm: '부피(CBM)',
  ton: '무게(톤)',
  qty: '수량',
  name: '이름',
  title: '제목',
  message: '내용',
  memo: '메모',
  rooms: '방 목록',
  lines: '물품 목록',
  options: '상품 목록',
  signerName: '서명하시는 분',
  signature: '서명',
  agree: '약관 동의',
  loginId: '아이디',
  password: '비밀번호',
};

const RULE: Record<string, (label: string) => string> = {
  isUuid: (l) => `${l}을(를) 목록에서 다시 골라 주세요`,
  isDateString: (l) => `${l} 날짜 형식이 올바르지 않습니다`,
  isISO8601: (l) => `${l} 날짜 형식이 올바르지 않습니다`,
  isIn: (l) => `${l}에 허용되지 않는 값입니다`,
  isEnum: (l) => `${l}에 허용되지 않는 값입니다`,
  isNotEmpty: (l) => `${l}은(는) 필수입니다`,
  isDefined: (l) => `${l}은(는) 필수입니다`,
  isString: (l) => `${l}은(는) 글자로 입력해 주세요`,
  isInt: (l) => `${l}은(는) 정수로 입력해 주세요`,
  isNumber: (l) => `${l}은(는) 숫자로 입력해 주세요`,
  isBoolean: (l) => `${l} 값이 올바르지 않습니다`,
  isArray: (l) => `${l} 형식이 올바르지 않습니다`,
  min: (l) => `${l}이(가) 너무 작습니다`,
  max: (l) => `${l}이(가) 너무 큽니다`,
  minLength: (l) => `${l}이(가) 너무 짧습니다`,
  maxLength: (l) => `${l}이(가) 너무 깁니다`,
  arrayMaxSize: (l) => `${l} 개수가 너무 많습니다`,
  arrayMinSize: (l) => `${l}을(를) 하나 이상 넣어 주세요`,
  matches: (l) => `${l} 형식이 올바르지 않습니다`,
  whitelistValidation: (l) => `알 수 없는 항목입니다(${l})`,
};

function collect(errors: ValidationError[], out: string[]) {
  for (const e of errors) {
    const label = FIELD_LABEL[e.property] ?? e.property;
    for (const [rule, raw] of Object.entries(e.constraints ?? {})) {
      // 직접 쓴 한국어 메시지는 그대로 둔다
      if (/[가-힣]/.test(raw)) out.push(raw);
      else out.push(RULE[rule]?.(label) ?? `${label} 값이 올바르지 않습니다`);
    }
    if (e.children?.length) collect(e.children, out);
  }
}

export function koreanValidationError(errors: ValidationError[]) {
  const messages: string[] = [];
  collect(errors, messages);
  return new BadRequestException([...new Set(messages)].join(' · ') || '입력값을 확인해 주세요');
}
