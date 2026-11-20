import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 지점 반려 형태 — 지점이 처리할 수 없어 본사로 되돌리는 이유 */
export const REJECT_KINDS = [
  '지점 마감',
  '지점 견적 거부',
  '서비스 지역 아님',
  '일정 불가',
  '기타',
];
/** 접수 취소 형태 */
export const CANCEL_KINDS = [
  '중복 접수',
  '고객 취소',
  '이사일 마감',
  '타사 계약',
  '연락 불가',
  '기타',
];

export class RejectLeadDto {
  /** 반려 사유(고르기) */
  @IsIn(REJECT_KINDS) kind!: string;
  /** 메모(선택) */
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
export class CancelLeadDto {
  @IsIn(CANCEL_KINDS) kind!: string;
  @IsString() @MinLength(2) @MaxLength(1000) reason!: string;
}
