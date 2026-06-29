import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

class ConfirmDepositDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number; // 견적 총액이 없을 때만 사용
}

@Controller('payment-confirmations')
export class PaymentConfirmationController {
  constructor(private readonly svc: PaymentConfirmationService) {}

  @Get()
  @RequirePermissions('PAYMENT.READ')
  list() {
    return this.svc.list();
  }

  @Post(':estimateId/deposit')
  @RequirePermissions('PAYMENT.WRITE')
  confirmDeposit(
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Body() dto: ConfirmDepositDto,
  ) {
    return this.svc.confirmDeposit(estimateId, dto.totalAmount);
  }

  @Post(':estimateId/balance')
  @RequirePermissions('PAYMENT.WRITE')
  confirmBalance(@Param('estimateId', ParseUUIDPipe) estimateId: string) {
    return this.svc.confirmBalance(estimateId);
  }
}
