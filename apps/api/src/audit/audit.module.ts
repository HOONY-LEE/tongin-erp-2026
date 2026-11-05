import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AccessLogInterceptor } from './access-log';

@Module({
  controllers: [AuditController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // 개인정보 열람·내려받기 기록(@AccessLog 붙은 라우트)
    { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
  ],
})
export class AuditModule {}
