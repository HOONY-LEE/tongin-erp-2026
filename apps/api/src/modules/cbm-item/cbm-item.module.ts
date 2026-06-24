import { Module } from '@nestjs/common';
import { CbmItemController } from './cbm-item.controller';
import { CbmItemService } from './cbm-item.service';

@Module({
  controllers: [CbmItemController],
  providers: [CbmItemService],
})
export class CbmItemModule {}
