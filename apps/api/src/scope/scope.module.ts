import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';

/** 조직 데이터범위 스코프를 전 도메인에서 주입 가능하도록 전역 제공. */
@Global()
@Module({
  providers: [ScopeService],
  exports: [ScopeService],
})
export class ScopeModule {}
