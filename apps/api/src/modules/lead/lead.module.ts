import { Module } from '@nestjs/common';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService], // 계약·작업 모듈이 상태 전이를 호출
})
export class LeadModule {}
