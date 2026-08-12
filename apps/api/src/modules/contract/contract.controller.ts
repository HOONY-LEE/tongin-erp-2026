import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { ContractService } from './contract.service';
import { CreateContractDto, CreatePaymentDto } from './dto/contract.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  @RequirePermissions('CONTRACT.READ')
  findAll(@CurrentUser() user: AuthPrincipal) {
    return this.contractService.findAll(user);
  }

  @Get(':id')
  @RequirePermissions('CONTRACT.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('CONTRACT.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateContractDto) {
    return this.contractService.create(dto, user);
  }

  @Post(':id/sign')
  @RequirePermissions('CONTRACT.WRITE')
  sign(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.sign(id, user);
  }

  @Get(':id/payments')
  @RequirePermissions('PAYMENT.READ')
  listPayments(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.listPayments(id, user);
  }

  @Post(':id/payments')
  @RequirePermissions('PAYMENT.WRITE')
  createPayment(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.contractService.createPayment(id, dto, user);
  }
}
