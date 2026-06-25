import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EstimateService } from './estimate.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { CreateLineDto, CreateZoneDto } from './dto/estimate-child.dto';
import { CreateCostLineDto } from './dto/cost-line.dto';
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

  // ── EST-03: 재료비 라인 ↔ 자재·재고 ──

  @Post(':id/cost-lines')
  @RequirePermissions('ESTIMATE.WRITE')
  addCostLine(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCostLineDto) {
    return this.estimateService.addCostLine(id, dto);
  }

  @Delete(':id/cost-lines/:costLineId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeCostLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('costLineId', ParseUUIDPipe) costLineId: string,
  ) {
    return this.estimateService.removeCostLine(id, costLineId);
  }

  /** 재료비 라인의 자재를 재고에서 일괄 차감(전표 OUT). */
  @Post(':id/deduct-materials')
  @RequirePermissions('ESTIMATE.WRITE')
  deductMaterials(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.deductMaterials(id);
  }

  @Get(':id/document')
  @RequirePermissions('ESTIMATE.READ')
  @Header('Content-Type', 'text/html; charset=utf-8')
  document(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.document(id);
  }
}
