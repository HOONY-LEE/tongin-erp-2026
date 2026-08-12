import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { MaterialOrderService } from './material-order.service';
import { CreateMaterialOrderDto } from './dto/create-material-order.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('material-orders')
export class MaterialOrderController {
  constructor(private readonly service: MaterialOrderService) {}

  @Get()
  @RequirePermissions('MATERIAL_ORDER.READ')
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(orgUnitId, status, user);
  }

  @Get(':id')
  @RequirePermissions('MATERIAL_ORDER.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateMaterialOrderDto) {
    return this.service.create(dto, user);
  }

  @Post(':id/approve')
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  approve(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(id, user);
  }

  /** 출고: 승인 발주 자재를 본사 재고에서 OUT 차감. */
  @Post(':id/ship')
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  ship(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.ship(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('MATERIAL_ORDER.WRITE')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(id, user);
  }
}
