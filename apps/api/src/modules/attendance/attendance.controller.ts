import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AttendanceService } from './attendance.service';
import {
  ClockDto,
  FixRecordDto,
  FixRequestDto,
  ImportCommitDto,
  ImportFileDto,
  WorkSettingsDto,
} from './dto/attendance.dto';

const ymd = (v?: string) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new BadRequestException('date는 YYYY-MM-DD 형식입니다.');
  return v;
};

/**
 * 근태. 출퇴근·내 근태·정정 신청은 로그인만으로(직원 연결 계정),
 * 전 직원 현황은 ATTENDANCE.READ, 기록 수정·근무시간 설정은 ATTENDANCE.UPDATE, 엑셀 업로드는 ATTENDANCE.IMPORT.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly att: AttendanceService) {}

  @Get('settings')
  settings() {
    return this.att.settings();
  }

  @Put('settings')
  @RequirePermissions('ATTENDANCE.UPDATE')
  saveSettings(@Body() dto: WorkSettingsDto) {
    return this.att.saveSettings(dto);
  }

  @Get('today')
  today(@CurrentUser() p: AuthPrincipal) {
    return this.att.today(p);
  }

  @Post('clock')
  clock(@CurrentUser() p: AuthPrincipal, @Body() dto: ClockDto) {
    return this.att.clock(p, dto.type);
  }

  @Get('me')
  me(@CurrentUser() p: AuthPrincipal, @Query('month') month: string) {
    return this.att.myMonth(p, month);
  }

  /** 한 직원의 한 달(본인 또는 ATTENDANCE.READ) */
  @Get('employees/:id')
  employee(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month: string,
  ) {
    return this.att.month(p, id, month);
  }

  @Get('daily')
  @RequirePermissions('ATTENDANCE.READ')
  daily(@CurrentUser() p: AuthPrincipal, @Query('date') date: string, @Query('hq') hq?: string) {
    return this.att.daily(p, ymd(date), hq === '1');
  }

  @Get('monthly')
  @RequirePermissions('ATTENDANCE.READ')
  monthly(
    @CurrentUser() p: AuthPrincipal,
    @Query('month') month: string,
    @Query('hq') hq?: string,
  ) {
    return this.att.monthly(p, month, hq === '1');
  }

  @Put('records')
  @RequirePermissions('ATTENDANCE.UPDATE')
  fix(@CurrentUser() p: AuthPrincipal, @Body() dto: FixRecordDto) {
    return this.att.fix(p, dto);
  }

  @Post('fix-requests')
  requestFix(@CurrentUser() p: AuthPrincipal, @Body() dto: FixRequestDto) {
    return this.att.requestFix(p, dto);
  }

  @Post('import/preview')
  @RequirePermissions('ATTENDANCE.IMPORT')
  importPreview(@Body() dto: ImportFileDto) {
    return this.att.importPreview(dto);
  }

  @Post('import/commit')
  @RequirePermissions('ATTENDANCE.IMPORT')
  importCommit(@CurrentUser() p: AuthPrincipal, @Body() dto: ImportCommitDto) {
    return this.att.importCommit(p, dto.rows);
  }
}
