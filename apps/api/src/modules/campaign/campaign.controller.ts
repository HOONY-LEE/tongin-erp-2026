import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @RequirePermissions('MARKETING.READ')
  findAll() {
    return this.campaignService.findAll();
  }

  @Get(':id')
  @RequirePermissions('MARKETING.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.findOne(id);
  }

  @Get(':id/preview')
  @RequirePermissions('MARKETING.READ')
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.previewCount(id);
  }

  @Post()
  @RequirePermissions('MARKETING.WRITE')
  create(@Body() dto: CreateCampaignDto) {
    return this.campaignService.create(dto);
  }

  @Post(':id/send')
  @RequirePermissions('MARKETING.WRITE')
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.send(id);
  }
}
