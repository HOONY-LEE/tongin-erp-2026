import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

/** 사이드바 메뉴 구성 — 관리자가 팀·권한 그룹·직책별로 정하고, 개인은 순서·숨김만 바꾼다 */
@Module({
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
