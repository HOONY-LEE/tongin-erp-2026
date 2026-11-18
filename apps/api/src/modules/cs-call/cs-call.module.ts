import { Module } from '@nestjs/common';
import { CsCallController } from './cs-call.controller';
import { CsCallService } from './cs-call.service';
import { CtiRoutingService } from './cti-routing.service';
import { CsOpsService } from './cs-ops.service';
import { CsFollowupController, MoveClosureController } from './cs-ops.controller';

/** 고객관리부 상담 콘솔 — 콜 자동 배분·아웃콜·콜백 */
@Module({
  controllers: [CsCallController, MoveClosureController, CsFollowupController],
  providers: [CsCallService, CtiRoutingService, CsOpsService],
})
export class CsCallModule {}
