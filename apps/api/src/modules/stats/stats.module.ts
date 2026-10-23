import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { BranchAnomalyService } from './branch-anomaly.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, BranchAnomalyService],
  exports: [BranchAnomalyService],
})
export class StatsModule {}
