import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { CommissionService } from './commission.service';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { CreateCommissionRuleDto, UpdateCommissionRuleDto } from './dto/commission-rule.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('settlements')
export class SettlementController {
  constructor(
    private readonly service: SettlementService,
    private readonly commission: CommissionService,
  ) {}

  // ── SET-01: 입금/미수금 ──

  /** 입금 현황(고객입금관리). 필터: status·kind·customerId·from·to. */
  @Get('payments')
  @RequirePermissions('SETTLEMENT.READ')
  payments(@CurrentUser() user: AuthPrincipal, @Query() q: PaymentQueryDto) {
    return this.service.payments(q, user);
  }

  /** 고객별 미수금. onlyOutstanding=true면 미수금>0만. */
  @Get('receivables')
  @RequirePermissions('SETTLEMENT.READ')
  receivables(
    @CurrentUser() user: AuthPrincipal,
    @Query('onlyOutstanding') onlyOutstanding?: string,
  ) {
    return this.service.receivables(onlyOutstanding === 'true', user);
  }

  /** 월별 입금액. year 지정 시 해당 연도만. */
  @Get('monthly')
  @RequirePermissions('SETTLEMENT.READ')
  monthly(@CurrentUser() user: AuthPrincipal, @Query('year') year?: string) {
    return this.service.monthlyInflow(year ? Number(year) : undefined, user);
  }

  // ── SET-02: 지점 정산/수수료 ──

  @Get('commission-rules')
  @RequirePermissions('SETTLEMENT.READ')
  listRules(@CurrentUser() user: AuthPrincipal) {
    return this.commission.listRules(user);
  }

  @Post('commission-rules')
  @RequirePermissions('SETTLEMENT.WRITE')
  createRule(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateCommissionRuleDto) {
    return this.commission.createRule(dto, user);
  }

  @Patch('commission-rules/:id')
  @RequirePermissions('SETTLEMENT.WRITE')
  updateRule(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionRuleDto,
  ) {
    return this.commission.updateRule(id, dto, user);
  }

  @Delete('commission-rules/:id')
  @RequirePermissions('SETTLEMENT.WRITE')
  @HttpCode(200)
  removeRule(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.commission.removeRule(id, user);
  }

  /** 지점 정산(연월): SIGNED 계약별 수수료 + 합계. */
  @Get('branch')
  @RequirePermissions('SETTLEMENT.READ')
  branch(
    @CurrentUser() user: AuthPrincipal,
    @Query('orgUnitId', ParseUUIDPipe) orgUnitId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.commission.branchSettlement(orgUnitId, year, month, user);
  }
}
