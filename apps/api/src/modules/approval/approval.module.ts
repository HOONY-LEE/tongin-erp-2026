import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ApprovalFormController } from './approval-form.controller';
import { ApprovalFormService } from './approval-form.service';

/** 전자결재 — 휴가·근태 모듈이 ApprovalService로 상신하고 결재 결과 반영 로직을 건다 */
@Module({
  controllers: [ApprovalController, ApprovalFormController],
  providers: [ApprovalService, ApprovalFormService],
  exports: [ApprovalService, ApprovalFormService],
})
export class ApprovalModule {}
