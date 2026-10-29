import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { TeamTaskService, type TaskScope } from './team-task.service';
import {
  CreateTeamTaskCommentDto,
  CreateTeamTaskDto,
  UpdateTeamTaskDto,
} from './dto/team-task.dto';

const SCOPES: TaskScope[] = ['mine', 'team', 'all'];

/**
 * 팀 업무 — 내 업무(담당·요청)는 로그인만으로 보고 고친다.
 * 우리 팀·전체 보기는 TASK.READ, 남의 업무 수정은 TASK.UPDATE, 등록·삭제는 TASK.CREATE·DELETE.
 */
@Controller('tasks')
export class TeamTaskController {
  constructor(private readonly tasks: TeamTaskService) {}

  @Get()
  findAll(
    @CurrentUser() p: AuthPrincipal,
    @Query('scope') scope = 'mine',
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    if (!SCOPES.includes(scope as TaskScope)) {
      throw new BadRequestException(`보기는 ${SCOPES.join(' | ')} 중 하나여야 합니다.`);
    }
    return this.tasks.findAll(p, scope as TaskScope, status, q);
  }

  /** 댓글 — 업무를 볼 수 있으면 누구나 보고 쓴다. 지우기는 쓴 사람만 */
  @Get(':id/comments')
  comments(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.comments(p, id);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTeamTaskCommentDto,
  ) {
    return this.tasks.addComment(p, id, dto);
  }

  @Delete(':id/comments/:commentId')
  removeComment(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.tasks.removeComment(p, id, commentId);
  }

  @Get(':id')
  findOne(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.findOne(p, id);
  }

  @Post()
  @RequirePermissions('TASK.CREATE')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateTeamTaskDto) {
    return this.tasks.create(p, dto);
  }

  /** 담당자·요청자는 권한 없이, 그 밖에는 TASK.UPDATE(서비스에서 따진다) */
  @Patch(':id')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamTaskDto,
  ) {
    return this.tasks.update(p, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('TASK.DELETE')
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(p, id);
  }
}
