import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto, CreateReceiptDto, SetOutsourceCostDto } from './dto/billing.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  // ── 마진 (D-3) ──

  /** 작업오더 전속원가 입력 → 계약 마진 반환. */
  @Put('work-orders/:id/outsource-cost')
  @RequirePermissions('BILLING.WRITE')
  setOutsourceCost(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetOutsourceCostDto) {
    return this.service.setOutsourceCost(id, dto);
  }

  /** 계약별 마진(매출−전속원가) 목록 + 합계. */
  @Get('margins')
  @RequirePermissions('BILLING.READ')
  margins(
    @Query('orgUnitId') orgUnitId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.margins(orgUnitId, from, to);
  }

  // ── 청구·수금 ──

  @Get('invoices')
  @RequirePermissions('BILLING.READ')
  listInvoices(@Query('partnerId') partnerId?: string, @Query('status') status?: string) {
    return this.service.listInvoices(partnerId, status);
  }

  @Post('invoices')
  @RequirePermissions('BILLING.WRITE')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.service.createInvoice(dto);
  }

  @Post('invoices/:id/issue')
  @RequirePermissions('BILLING.WRITE')
  issueInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.issueInvoice(id);
  }

  @Post('invoices/:id/receipts')
  @RequirePermissions('BILLING.WRITE')
  addReceipt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReceiptDto) {
    return this.service.addReceipt(id, dto);
  }

  /** 거래처별 미수금(청구−수금). */
  @Get('partner-receivables')
  @RequirePermissions('BILLING.READ')
  partnerReceivables() {
    return this.service.partnerReceivables();
  }
}
