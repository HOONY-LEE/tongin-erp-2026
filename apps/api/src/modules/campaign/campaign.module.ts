import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { StubNotificationProvider } from '../../notifications/notification.provider';

@Module({
  controllers: [CampaignController],
  providers: [CampaignService, StubNotificationProvider],
})
export class CampaignModule {}
