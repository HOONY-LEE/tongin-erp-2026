import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TASK_PRIORITY, TASK_STATUS, type TaskPriority, type TaskStatus } from '@tongin/shared';

export class CreateTeamTaskDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  /** 맡은 팀(조직) — 비우면 개인 업무(담당·요청·만든 사람만 봄). 담당자 소속과 상관없다 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  teamOrgId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  assigneeEmpId?: string | null;

  /** 다른 팀이 요청해 올린 일이면 요청한 사람 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  requesterEmpId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  project?: string | null;

  /** 업무 분장 항목(어느 맡은 일의 하나인지) */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  dutyId?: string | null;

  @IsOptional()
  @IsIn(TASK_STATUS)
  status?: TaskStatus;

  @IsOptional()
  @IsIn(TASK_PRIORITY)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class UpdateTeamTaskDto extends PartialType(CreateTeamTaskDto) {}

/** 업무 댓글 — 멘션은 화면에서 고른 직원 id(본문의 '@이름'도 서버가 함께 찾는다) */
export class CreateTeamTaskCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mentionEmpIds?: string[];
}

/** 담당 넘기기 — 비우면 담당자 없음으로 */
export class AssignTeamTaskDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  assigneeEmpId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
