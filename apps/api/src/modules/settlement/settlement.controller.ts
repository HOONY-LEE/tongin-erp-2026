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
  payments(@Query() q: PaymentQueryDto) {
    return this.service.payments(q);
  }

  /** 고객별 미수금. onlyOutstanding=true면 미수금>0만. */
  @Get('receivables')
  @RequirePermissions('SETTLEMENT.READ')
  receivables(@Query('onlyOutstanding') onlyOutstanding?: string) {
    return this.service.receivables(onlyOutstanding === 'true');
  }

  /** 월별 입금액. year 지정 시 해당 연도만. */
  @Get('monthly')
  @RequirePermissions('SETTLEMENT.READ')
  monthly(@Query('year') year?: string) {
    return this.service.monthlyInflow(year ? Number(year) : undefined);
  }

  // ── SET-02: 지점 정산/수수료 ──

  @Get('commission-rules')
  @RequirePermissions('SETTLEMENT.READ')
  listRules() {
    return this.commission.listRules();
  }

  @Post('commission-rules')
  @RequirePermissions('SETTLEMENT.WRITE')
  createRule(@Body() dto: CreateCommissionRuleDto) {
    return this.commission.createRule(dto);
  }

  @Patch('commission-rules/:id')
  @RequirePermissions('SETTLEMENT.WRITE')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommissionRuleDto) {
    return this.commission.updateRule(id, dto);
  }

  @Delete('commission-rules/:id')
  @RequirePermissions('SETTLEMENT.WRITE')
  @HttpCode(200)
  removeRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.commission.removeRule(id);
  }

  /** 지점 정산(연월): SIGNED 계약별 수수료 + 합계. */
  @Get('branch')
  @RequirePermissions('SETTLEMENT.READ')
  branch(
    @Query('orgUnitId', ParseUUIDPipe) orgUnitId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.commission.branchSettlement(orgUnitId, year, month);
  }
}
