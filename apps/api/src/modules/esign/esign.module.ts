import { Module } from '@nestjs/common';
import { StubNotificationProvider } from '../../notifications/notification.provider';
import { ContractModule } from '../contract/contract.module';
import { EstimateModule } from '../estimate/estimate.module';
import { LeadModule } from '../lead/lead.module';
import { EsignController, PublicSignController } from './esign.controller';
import { EsignService } from './esign.service';

/** 견적서 보내기 → 고객 전자서명 → 계약금 입금 자동 확인 */
@Module({
  imports: [ContractModule, EstimateModule, LeadModule],
  controllers: [EsignController, PublicSignController],
  providers: [EsignService, StubNotificationProvider],
})
export class EsignModule {}
