import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { SERVICE_ORDER_STATUS, type AuthPrincipal, type ServiceOrderStatus } from '@tongin/shared';
import { BadRequestException } from '@nestjs/common';
import { ServiceOrderService } from './service-order.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('service-orders')
export class ServiceOrderController {
  constructor(private readonly service: ServiceOrderService) {}

  @Get()
  @RequirePermissions('SERVICE_ORDER.READ')
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query('serviceLine') serviceLine?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(serviceLine, status, user);
  }

  @Get(':id')
  @RequirePermissions('SERVICE_ORDER.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermissions('SERVICE_ORDER.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateServiceOrderDto) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('SERVICE_ORDER.WRITE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderDto,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/transition')
  @RequirePermissions('SERVICE_ORDER.WRITE')
  transition(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('to') to: string,
  ) {
    if (!(SERVICE_ORDER_STATUS as readonly string[]).includes(to)) {
      throw new BadRequestException(
        `상태는 ${SERVICE_ORDER_STATUS.join(' | ')} 중 하나여야 합니다.`,
      );
    }
    return this.service.transition(id, to as ServiceOrderStatus, user);
  }
}
