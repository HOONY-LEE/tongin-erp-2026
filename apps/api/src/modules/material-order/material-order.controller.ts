import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { MaterialOrderService } from './material-order.service';
import { CreateMaterialOrderDto } from './dto/create-material-order.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('material-orders')
export class MaterialOrderController {
  constructor(private readonly service: MaterialOrderService) {}

  @Get()
  @RequirePermissions('MATERIAL_ORDER.READ')
  findAll(@Query('orgUnitId') orgUnitId?: string, @Query('status') status?: string) {
    return this.service.findAll(orgUnitId, status);
  }

  @Get(':id')
  @RequirePermissions('MATERIAL_ORDER.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  create(@Body() dto: CreateMaterialOrderDto) {
    return this.service.create(dto);
  }

  @Post(':id/approve')
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(id);
  }

  /** 출고: 승인 발주 자재를 본사 재고에서 OUT 차감. */
  @Post(':id/ship')
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  ship(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.ship(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(id);
  }
}
