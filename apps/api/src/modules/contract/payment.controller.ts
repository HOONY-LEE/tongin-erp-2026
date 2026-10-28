import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { ContractService } from './contract.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private readonly contractService: ContractService) {}

  /** 토스 입금통보(웹훅) 대체 — 입금 확인 시 PAID 자동 전환 */
  @Post(':id/confirm')
  @RequirePermissions('PAYMENT.UPDATE')
  confirm(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    // 계약금이면 접수도 '계약'으로 넘긴다(입금확인 화면·웹훅과 같은 처리).
    // 사람이 누르는 확인이라 조직 범위 안 계약의 결제인지 함께 본다.
    return this.contractService.markPaid(id, user);
  }
}
