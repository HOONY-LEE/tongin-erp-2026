import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EstimateService } from './estimate.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { CreateLineDto, CreateZoneDto } from './dto/estimate-child.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('estimates')
export class EstimateController {
  constructor(private readonly estimateService: EstimateService) {}

  @Get()
  @RequirePermissions('ESTIMATE.READ')
  findAll(@Query('leadId') leadId?: string) {
    return this.estimateService.findAll(leadId);
  }

  @Get(':id')
  @RequirePermissions('ESTIMATE.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.findOne(id);
  }

  @Post()
  @RequirePermissions('ESTIMATE.WRITE')
  create(@Body() dto: CreateEstimateDto) {
    return this.estimateService.create(dto);
  }

  @Post(':id/zones')
  @RequirePermissions('ESTIMATE.WRITE')
  addZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateZoneDto) {
    return this.estimateService.addZone(id, dto);
  }

  @Post(':id/lines')
  @RequirePermissions('ESTIMATE.WRITE')
  addLine(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLineDto) {
    return this.estimateService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.estimateService.removeLine(id, lineId);
  }

  @Post(':id/quote')
  @RequirePermissions('ESTIMATE.WRITE')
  quote(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.quote(id);
  }
}
