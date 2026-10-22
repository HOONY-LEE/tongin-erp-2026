import { Module } from '@nestjs/common';
import { HandlingMethodController, RoomTemplateController } from './move-catalog.controller';
import { MoveCatalogService } from './move-catalog.service';

/** 이사물량 카탈로그 — 방 틀 · 처리방법 (이사물품 사전은 cbm-item 모듈) */
@Module({
  controllers: [RoomTemplateController, HandlingMethodController],
  providers: [MoveCatalogService],
  exports: [MoveCatalogService],
})
export class MoveCatalogModule {}
