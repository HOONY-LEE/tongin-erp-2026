import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

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
  list(@CurrentUser() user: AuthPrincipal) {
    return this.svc.list(user);
  }

  @Post(':estimateId/deposit')
  @RequirePermissions('PAYMENT.WRITE')
  confirmDeposit(
    @CurrentUser() user: AuthPrincipal,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
    @Body() dto: ConfirmDepositDto,
  ) {
    return this.svc.confirmDeposit(estimateId, dto.totalAmount, user);
  }

  @Post(':estimateId/balance')
  @RequirePermissions('PAYMENT.WRITE')
  confirmBalance(
    @CurrentUser() user: AuthPrincipal,
    @Param('estimateId', ParseUUIDPipe) estimateId: string,
  ) {
    return this.svc.confirmBalance(estimateId, user);
  }
}
