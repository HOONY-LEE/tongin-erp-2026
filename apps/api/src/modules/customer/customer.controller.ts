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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @RequirePermissions('CUSTOMER.READ')
  findAll(@CurrentUser() user: AuthPrincipal, @Query('phone') phone?: string) {
    return this.customerService.findAll(phone, user);
  }

  @Get(':id')
  @RequirePermissions('CUSTOMER.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('CUSTOMER.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('CUSTOMER.WRITE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('CUSTOMER.WRITE')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.remove(id, user);
  }
}
