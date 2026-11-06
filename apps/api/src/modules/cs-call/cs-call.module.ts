import { Module } from '@nestjs/common';
import { CsCallController } from './cs-call.controller';
import { CsCallService } from './cs-call.service';

/** 고객관리부 상담 콘솔 — 콜 자동 배분·아웃콜·콜백 */
@Module({ controllers: [CsCallController], providers: [CsCallService] })
export class CsCallModule {}
