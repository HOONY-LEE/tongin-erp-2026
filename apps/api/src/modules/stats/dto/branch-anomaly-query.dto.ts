import { IsDateString, IsOptional, Matches } from 'class-validator';

/** CRM-01b: 이상 지점(수수료 누락 의심) 분석 조건 */
export class BranchAnomalyQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string; // 접수일 시작(YYYY-MM-DD, 기본 180일 전)

  @IsOptional()
  @IsDateString()
  to?: string; // 접수일 끝(YYYY-MM-DD, 기본 오늘)

  @IsOptional()
  @Matches(/^\d{1,3}$/)
  minLeads?: string; // 표본 최소 접수 건수(기본 5) — 이보다 적은 지점은 빼고 비교
}
