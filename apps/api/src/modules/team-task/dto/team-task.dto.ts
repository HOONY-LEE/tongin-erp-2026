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

  /** 맡은 팀(조직) */
  @IsUUID()
  teamOrgId!: string;

  @IsOptional()
  @IsUUID()
  assigneeEmpId?: string | null;

  /** 다른 팀이 요청해 올린 일이면 요청한 사람 */
  @IsOptional()
  @IsUUID()
  requesterEmpId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  project?: string | null;

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
