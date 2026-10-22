import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { StubNotificationProvider } from '../notifications/notification.provider';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ApiCatalog } from './api-catalog';
import { DomainTools } from './domain-tools';

/** AIX-03: AI 비서 — Claude가 ERP 도구(API 카탈로그 + 업무 도구)를 골라 실행한다 */
@Module({
  imports: [DiscoveryModule],
  controllers: [AiController],
  providers: [AiService, ApiCatalog, DomainTools, StubNotificationProvider],
})
export class AiModule {}
