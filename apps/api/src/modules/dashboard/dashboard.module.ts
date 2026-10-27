import { Module } from '@nestjs/common';
import { StatsModule } from '../stats/stats.module';
import { DashboardController } from './dashboard.controller';
import { DashboardDataService } from './dashboard-data.service';
import { DashboardService } from './dashboard.service';

/** 대시보드 빌더 — 위젯 데이터·내 대시보드·템플릿과 지정 */
@Module({
  imports: [StatsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardDataService],
})
export class DashboardModule {}
