import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CsOpsService, kDay, type FollowupKind } from './cs-ops.service';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
class RangeQuery {
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;
}
class ClosureDto {
  @Matches(DAY) date!: string;
  @IsOptional() @IsUUID() orgUnitId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) memo?: string;
}
class FollowupQuery {
  @IsIn(['CONFIRM', 'HAPPY']) kind!: FollowupKind;
  @IsOptional() @Matches(DAY) date?: string;
}
class FollowupDto {
  @IsUUID() leadId!: string;
  @IsIn(['CONFIRM', 'HAPPY']) kind!: FollowupKind;
  @IsIn(['DONE', 'NO_ANSWER']) result!: 'DONE' | 'NO_ANSWER';
  @IsOptional() @IsString() @MaxLength(1000) memo?: string;
}

/** 이사일 마감 — 지점별 그날 더 받을 수 없음 표시(상담 콘솔 달력·마감 캘린더) */
@Controller('move-closures')
export class MoveClosureController {
  constructor(private readonly ops: CsOpsService) {}

  @Get()
  @RequirePermissions('LEAD.READ')
  list(@CurrentUser() user: AuthPrincipal, @Query() q: RangeQuery) {
    const from = q.from ?? `${kDay().slice(0, 8)}01`;
    return this.ops.closures(user, from, q.to ?? kDay(60));
  }

  @Post()
  @RequirePermissions('LEAD.UPDATE')
  add(@CurrentUser() user: AuthPrincipal, @Body() dto: ClosureDto) {
    return this.ops.addClosure(user, dto);
  }

  @Delete(':id')
  @RequirePermissions('LEAD.UPDATE')
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.removeClosure(user, id);
  }
}

/** 이사 확인콜(2일 전)·해피콜(다음 날) */
@Controller('cs-followups')
export class CsFollowupController {
  constructor(private readonly ops: CsOpsService) {}

  @Get()
  @RequirePermissions('LEAD.CREATE')
  list(@CurrentUser() user: AuthPrincipal, @Query() q: FollowupQuery) {
    return this.ops.followups(user, q.kind, q.date);
  }

  @Get('counts')
  @RequirePermissions('LEAD.CREATE')
  counts(@CurrentUser() user: AuthPrincipal) {
    return this.ops.followupCounts(user);
  }

  @Post()
  @RequirePermissions('LEAD.CREATE')
  add(@CurrentUser() user: AuthPrincipal, @Body() dto: FollowupDto) {
    return this.ops.addFollowup(user, dto);
  }
}
