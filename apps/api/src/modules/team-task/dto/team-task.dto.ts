import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
