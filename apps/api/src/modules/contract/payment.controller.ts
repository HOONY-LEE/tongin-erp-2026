import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ContractService } from './contract.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private readonly contractService: ContractService) {}

  /** 토스 입금통보(웹훅) 대체 — 입금 확인 시 PAID 자동 전환 */
  @Post(':id/confirm')
  @RequirePermissions('PAYMENT.UPDATE')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    // 계약금이면 접수도 '계약'으로 넘긴다(입금확인 화면·웹훅과 같은 처리)
    return this.contractService.markPaid(id);
  }
}
