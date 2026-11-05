import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { StubNotificationProvider } from '../notifications/notification.provider';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiFiles } from './ai-files.service';
import { AiUsageService } from './ai-usage.service';
import { AiAdminController } from './ai-admin.controller';
import { ApiCatalog } from './api-catalog';
import { DomainTools } from './domain-tools';
import { PiiVault } from './pii-vault';

/** AIX-03: AI 비서 — Claude가 ERP 도구(API 카탈로그 + 업무 도구)를 골라 실행한다 */
@Module({
  imports: [DiscoveryModule],
  controllers: [AiController, AiAdminController],
  providers: [
    AiService,
    AiFiles,
    AiUsageService,
    ApiCatalog,
    DomainTools,
    PiiVault,
    StubNotificationProvider,
  ],
  // 에이전트 빌더가 같은 도구 목록(권한 거른 것)·가명 처리를 쓴다
  exports: [AiService, AiFiles, AiUsageService, PiiVault],
})
export class AiModule {}
