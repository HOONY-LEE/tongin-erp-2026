import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ContractService } from './contract.service';
import { CreateContractDto, CreatePaymentDto } from './dto/contract.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  @RequirePermissions('CONTRACT.READ')
  findAll() {
    return this.contractService.findAll();
  }

  @Get(':id')
  @RequirePermissions('CONTRACT.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.findOne(id);
  }

  @Post()
  @RequirePermissions('CONTRACT.WRITE')
  create(@Body() dto: CreateContractDto) {
    return this.contractService.create(dto);
  }

  @Post(':id/sign')
  @RequirePermissions('CONTRACT.WRITE')
  sign(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.sign(id);
  }

  @Get(':id/payments')
  @RequirePermissions('PAYMENT.READ')
  listPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.listPayments(id);
  }

  @Post(':id/payments')
  @RequirePermissions('PAYMENT.WRITE')
  createPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePaymentDto) {
    return this.contractService.createPayment(id, dto);
  }
}
