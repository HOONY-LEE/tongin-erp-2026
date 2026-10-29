import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { LeaveService } from './leave.service';
import {
  AdjustLeaveDto,
  BulkAdjustLeaveDto,
  CreateLeaveTypeDto,
  RequestLeaveDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';

/**
 * 휴가. 내 휴가 조회·신청은 로그인만으로(직원 연결 계정),
 * 전 직원 현황은 LEAVE.READ, 연차 조정·휴가 종류 관리는 LEAVE.UPDATE.
 */
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  types(@CurrentUser() p: AuthPrincipal, @Query('all') all?: string) {
    const canSeeAll = p.permissions.includes('*') || p.permissions.includes('LEAVE.UPDATE');
    return this.leave.types(all === '1' && canSeeAll);
  }

  @Post('types')
  @RequirePermissions('LEAVE.UPDATE')
  createType(@Body() dto: CreateLeaveTypeDto) {
    return this.leave.createType(dto);
  }

  @Patch('types/:id')
  @RequirePermissions('LEAVE.UPDATE')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leave.updateType(id, dto);
  }

  @Get('me')
  me(@CurrentUser() p: AuthPrincipal) {
    return this.leave.myLeave(p);
  }

  @Post('requests')
  request(@CurrentUser() p: AuthPrincipal, @Body() dto: RequestLeaveDto) {
    return this.leave.request(p, dto);
  }

  /** 전 직원 연차 현황 — hq=1이면 본사 직원만 */
  @Get('summary')
  @RequirePermissions('LEAVE.READ')
  summary(@CurrentUser() p: AuthPrincipal, @Query('hq') hq?: string) {
    return this.leave.summary(p, hq === '1');
  }

  /** 한 직원의 휴가(본인 또는 LEAVE.READ) */
  @Get('employees/:id')
  employee(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.employeeLeave(p, id);
  }

  @Post('adjustments')
  @RequirePermissions('LEAVE.UPDATE')
  adjust(@CurrentUser() p: AuthPrincipal, @Body() dto: AdjustLeaveDto) {
    return this.leave.adjust(p, dto);
  }

  /** 연차 일괄 부여·차감(직원 여럿·조직 단위) */
  @Post('adjustments/bulk')
  @RequirePermissions('LEAVE.UPDATE')
  bulkAdjust(@CurrentUser() p: AuthPrincipal, @Body() dto: BulkAdjustLeaveDto) {
    return this.leave.bulkAdjust(p, dto);
  }

  /** 최근 조정 이력 */
  @Get('adjustments')
  @RequirePermissions('LEAVE.UPDATE')
  adjustments(@CurrentUser() p: AuthPrincipal) {
    return this.leave.adjustments(p);
  }
}
