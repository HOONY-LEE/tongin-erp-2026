import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmImportService } from './crm-import.service';

/** 영업 CRM 공통 틀 — 가맹 영업 · 기업영업 */
@Module({
  controllers: [CrmController],
  providers: [CrmService, CrmImportService],
  exports: [CrmService],
})
export class CrmModule {}
