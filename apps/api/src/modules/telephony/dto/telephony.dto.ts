import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLineDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string | null;
}

export class UpdateLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** 웹훅 주소(토큰) 새로 만들기 — 예전 주소는 바로 막힌다 */
  @IsOptional()
  @IsBoolean()
  rotate?: boolean;
}

export class UpdateCallDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;

  @IsOptional()
  @IsUUID()
  leadId?: string | null;
}

export class TestCallDto {
  @IsString()
  @MaxLength(30)
  from!: string;

  @IsOptional()
  @IsIn(['ringing', 'answered', 'ended', 'missed'])
  event?: string;

  /** 앞서 만든 가상 통화를 이어서(응대·종료) */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  callId?: string;

  @IsOptional()
  @IsUUID()
  lineId?: string;
}
