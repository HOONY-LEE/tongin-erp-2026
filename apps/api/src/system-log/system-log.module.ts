import { Module } from '@nestjs/common';
import { SystemLogController } from './system-log.controller';
import { SystemLogService } from './system-log.service';

/** 시스템 로그 — 경고·오류를 모아 DB에 남기고(30일·2만 줄), 관리자가 찾아본다 */
@Module({
  controllers: [SystemLogController],
  providers: [SystemLogService],
})
export class SystemLogModule {}
