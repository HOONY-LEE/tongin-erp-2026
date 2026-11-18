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
  Query,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerHistoryService } from './customer-history.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';
import { AccessLog } from '../../audit/access-log';

@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly historyService: CustomerHistoryService,
  ) {}

  @AccessLog('customer', 'LIST')
  @Get()
  @RequirePermissions('CUSTOMER.READ')
  findAll(@CurrentUser() user: AuthPrincipal, @Query('phone') phone?: string) {
    return this.customerService.findAll(phone, user);
  }

  /** 고객 등급 목록(공통코드 CUSTOMER_GRADE, 사용 중인 것만) — 등급 고르기·필터용 */
  @Get('grades')
  @RequirePermissions('CUSTOMER.READ')
  grades() {
    return this.customerService.grades();
  }

  @AccessLog('customer', 'VIEW')
  @Get(':id')
  @RequirePermissions('CUSTOMER.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.findOne(id, user);
  }

  /** 고객 이력(CRM) — 처음 유입·통화·접수·담당자 변경·견적·계약·입금·작업을 시간순으로 */
  @AccessLog('customer', 'VIEW')
  @Get(':id/history')
  @RequirePermissions('CUSTOMER.READ')
  async history(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.customerService.findOne(id, user);
    return this.historyService.history(id);
  }

  @Post()
  @RequirePermissions('CUSTOMER.CREATE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('CUSTOMER.UPDATE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('CUSTOMER.DELETE')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.remove(id, user);
  }
}
