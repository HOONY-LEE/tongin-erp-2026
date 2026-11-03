import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { BranchAnomalyService } from './branch-anomaly.service';
import { SalesStatsService } from './sales-stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, BranchAnomalyService, SalesStatsService],
  exports: [BranchAnomalyService],
})
export class StatsModule {}
