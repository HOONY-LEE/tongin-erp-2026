import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateMovementDto {
  @IsIn(['IN', 'OUT', 'ADJUST'])
  type!: 'IN' | 'OUT' | 'ADJUST';

  /** 수량(양수). IN=증가, OUT=감소, ADJUST=증감(부호는 adjustSign으로). */
  @IsInt()
  @Min(1)
  qty!: number;

  /** ADJUST일 때만 사용: 감소 조정이면 false. 기본 true(증가). */
  @IsOptional()
  adjustIncrease?: boolean;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string; // 창고/지점

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
