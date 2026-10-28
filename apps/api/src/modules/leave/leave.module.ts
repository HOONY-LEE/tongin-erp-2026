import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

/** 휴가 — 신청은 전자결재(LEAVE)로 올라가고, 결재 결과를 ApprovalService 핸들러로 받아 반영한다 */
@Module({
  imports: [ApprovalModule],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
