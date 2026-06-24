import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ContractService } from './contract.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private readonly contractService: ContractService) {}

  /** 토스 입금통보(웹훅) 대체 — 입금 확인 시 PAID 자동 전환 */
  @Post(':id/confirm')
  @RequirePermissions('PAYMENT.WRITE')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractService.confirmPayment(id);
  }
}
