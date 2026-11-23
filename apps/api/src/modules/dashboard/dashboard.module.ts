import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveModule } from '../leave/leave.module';
import { CrmModule } from '../crm/crm.module';
import { StatsModule } from '../stats/stats.module';
import { DashboardController } from './dashboard.controller';
import { DashboardDataService } from './dashboard-data.service';
import { DashboardService } from './dashboard.service';
import { CustomWidgetController } from './custom-widget.controller';
import { StudioQueryService } from './studio-query.service';
import { WidgetStudioAiService } from './widget-studio-ai.service';

/** 대시보드 빌더 — 위젯 데이터·내 대시보드·템플릿과 지정, 위젯 스튜디오(만든 위젯·미리보기·AI 제안) */
@Module({
  imports: [StatsModule, ApprovalModule, LeaveModule, AttendanceModule, CrmModule],
  controllers: [DashboardController, CustomWidgetController],
  providers: [DashboardService, DashboardDataService, StudioQueryService, WidgetStudioAiService],
})
export class DashboardModule {}
