import { Module } from '@nestjs/common';
import { BranchCaseController } from './branch-case.controller';
import { BranchCaseService } from './branch-case.service';

@Module({
  controllers: [BranchCaseController],
  providers: [BranchCaseService],
})
export class BranchCaseModule {}
