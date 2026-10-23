import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { CampaignService } from './campaign.service';
import {
  AudienceQueryDto,
  CreateCampaignDto,
  DemoNumberDto,
  StaffQueryDto,
  UpdateCampaignDto,
} from './dto/create-campaign.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get()
  @RequirePermissions('MARKETING.READ')
  findAll() {
    return this.campaignService.findAll();
  }

  /** 받을 고객 찾기(조건 + 페이지) */
  @Post('audience')
  @RequirePermissions('MARKETING.READ')
  audience(@CurrentUser() user: AuthPrincipal, @Body() q: AudienceQueryDto) {
    return this.campaignService.searchAudience(q, user);
  }

  /** 조건에 맞는 고객 전체 id — 검색 결과 전체 선택 */
  @Post('audience/ids')
  @RequirePermissions('MARKETING.READ')
  audienceIds(@CurrentUser() user: AuthPrincipal, @Body() q: AudienceQueryDto) {
    return this.campaignService.audienceIds(q, user);
  }

  /** 받을 직원 찾기(시연 발송용) */
  @Post('audience/staff')
  @RequirePermissions('MARKETING.READ')
  staff(@CurrentUser() user: AuthPrincipal, @Body() q: StaffQueryDto) {
    return this.campaignService.searchStaff(q, user);
  }

  /** 시연 번호(문자 허용 번호에 들어간다) */
  @Get('demo-numbers')
  @RequirePermissions('MARKETING.READ')
  demoNumbers() {
    return this.campaignService.demoNumbers();
  }

  @Post('demo-numbers')
  @RequirePermissions('MARKETING.WRITE')
  addDemoNumber(@Body() dto: DemoNumberDto) {
    return this.campaignService.addDemoNumber(dto);
  }

  @Delete('demo-numbers/:phone')
  @RequirePermissions('MARKETING.WRITE')
  @HttpCode(204)
  removeDemoNumber(@Param('phone') phone: string) {
    return this.campaignService.removeDemoNumber(phone);
  }

  @Get(':id')
  @RequirePermissions('MARKETING.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.detail(id);
  }

  @Get(':id/preview')
  @RequirePermissions('MARKETING.READ')
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.previewCount(id);
  }

  @Post()
  @RequirePermissions('MARKETING.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCampaignDto) {
    return this.campaignService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('MARKETING.WRITE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('MARKETING.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.remove(id);
  }

  /** 발송(예약 시각이 미래면 예약) */
  @Post(':id/send')
  @RequirePermissions('MARKETING.WRITE')
  send(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.send(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('MARKETING.WRITE')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignService.cancel(id);
  }
}
