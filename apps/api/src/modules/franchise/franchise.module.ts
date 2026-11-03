import { Module } from '@nestjs/common';
import { FranchiseController } from './franchise.controller';
import { FranchiseService } from './franchise.service';

/** 가맹 — 가맹점 현황(계약·가맹비·보증금·재계약) · 가맹 영업 CRM(가맹점 모집) */
@Module({
  controllers: [FranchiseController],
  providers: [FranchiseService],
})
export class FranchiseModule {}
