import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateInvoiceDto, CreateReceiptDto, SetOutsourceCostDto } from './dto/billing.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  // ── 마진 (D-3) ──

  /** 작업오더 전속원가 입력 → 계약 마진 반환. */
  @Put('work-orders/:id/outsource-cost')
  @RequirePermissions('BILLING.WRITE')
  setOutsourceCost(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOutsourceCostDto,
  ) {
    return this.service.setOutsourceCost(id, dto, user);
  }

  /** 계약별 마진(매출−전속원가) 목록 + 합계. */
  @Get('margins')
  @RequirePermissions('BILLING.READ')
  margins(
    @CurrentUser() user: AuthPrincipal,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.margins(orgUnitId, from, to, user);
  }

  // ── 청구·수금 ──

  @Get('invoices')
  @RequirePermissions('BILLING.READ')
  listInvoices(
    @CurrentUser() user: AuthPrincipal,
    @Query('partnerId') partnerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listInvoices(partnerId, status, user);
  }

  @Post('invoices')
  @RequirePermissions('BILLING.WRITE')
  createInvoice(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateInvoiceDto) {
    return this.service.createInvoice(dto, user);
  }

  @Post('invoices/:id/issue')
  @RequirePermissions('BILLING.WRITE')
  issueInvoice(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.issueInvoice(id, user);
  }

  @Post('invoices/:id/receipts')
  @RequirePermissions('BILLING.WRITE')
  addReceipt(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.service.addReceipt(id, dto, user);
  }

  /** 거래처별 미수금(청구−수금). */
  @Get('partner-receivables')
  @RequirePermissions('BILLING.READ')
  partnerReceivables(@CurrentUser() user: AuthPrincipal) {
    return this.service.partnerReceivables(user);
  }
}
