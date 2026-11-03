import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BranchService } from './branch.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  /** 지점별 접수·계약·매출·작업·직원 현황. from·to(YYYY-MM-DD, 한국 날짜, 포함)를 주면 그 기간 실적 */
  @Get('overview')
  @RequirePermissions('ORG_UNIT.READ')
  overview(@Query('from') from?: string, @Query('to') to?: string) {
    const ok = (s?: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!ok(from) || !ok(to)) throw new BadRequestException('기간은 YYYY-MM-DD로 넣어 주세요.');
    return this.branchService.overview(from || undefined, to || undefined);
  }
}
