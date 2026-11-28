import { Module } from '@nestjs/common';
import { BranchTerritoryController } from './branch-territory.controller';
import { BranchTerritoryService } from './branch-territory.service';

@Module({
  controllers: [BranchTerritoryController],
  providers: [BranchTerritoryService],
})
export class BranchTerritoryModule {}
