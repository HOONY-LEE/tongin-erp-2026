import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveModule } from '../leave/leave.module';
import { StatsModule } from '../stats/stats.module';
import { DashboardController } from './dashboard.controller';
import { DashboardDataService } from './dashboard-data.service';
import { DashboardService } from './dashboard.service';

/** 대시보드 빌더 — 위젯 데이터·내 대시보드·템플릿과 지정 */
@Module({
  imports: [StatsModule, ApprovalModule, LeaveModule, AttendanceModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardDataService],
})
export class DashboardModule {}
