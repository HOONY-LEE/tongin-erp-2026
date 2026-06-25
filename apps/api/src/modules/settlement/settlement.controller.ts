import { Controller, Get, Query } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('settlements')
export class SettlementController {
  constructor(private readonly service: SettlementService) {}

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
}
