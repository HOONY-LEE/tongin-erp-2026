import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { DutyController, KpiController } from './performance.controller';
import { DutyService } from './duty.service';
import { KpiService } from './kpi.service';

/** 업무 분장(조직·직원 역할과 업무 범위) · 성과 평가(조직·개인 KPI, 다각형 차트) */
@Module({
  imports: [AttendanceModule],
  controllers: [DutyController, KpiController],
  providers: [DutyService, KpiService],
  exports: [DutyService],
})
export class PerformanceModule {}
