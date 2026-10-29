import { Global, Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxListener } from './inbox.listener';
import { InboxService } from './inbox.service';

/** 내 알림 — 결재·배정·멘션·공지처럼 나와 관련된 일. 어느 모듈에서나 InboxService로 남긴다 */
@Global()
@Module({
  controllers: [InboxController],
  providers: [InboxService, InboxListener],
  exports: [InboxService],
})
export class InboxModule {}
