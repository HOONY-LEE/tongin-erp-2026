import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { WorkOrderService } from './work-order.service';
import { CreateAssignmentDto, CreateWorkOrderDto } from './dto/work-order.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('work-orders')
export class WorkOrderController {
  constructor(private readonly workOrderService: WorkOrderService) {}

  @Get()
  @RequirePermissions('WORK_ORDER.READ')
  findAll(@Query('status') status?: string) {
    return this.workOrderService.findAll(status);
  }

  @Get(':id')
  @RequirePermissions('WORK_ORDER.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.findOne(id);
  }

  @Post()
  @RequirePermissions('WORK_ORDER.WRITE')
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrderService.create(dto);
  }

  @Post(':id/assignments')
  @RequirePermissions('WORK_ORDER.WRITE')
  addAssignment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAssignmentDto) {
    return this.workOrderService.addAssignment(id, dto);
  }

  @Post(':id/start')
  @RequirePermissions('WORK_ORDER.WRITE')
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.start(id);
  }

  @Post(':id/complete')
  @RequirePermissions('WORK_ORDER.WRITE')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.complete(id);
  }
}
