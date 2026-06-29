import { Controller, Get } from '@nestjs/common';
import { BranchService } from './branch.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  /** 지점별 매출·작업·직원 현황. */
  @Get('overview')
  @RequirePermissions('ORG_UNIT.READ')
  overview() {
    return this.branchService.overview();
  }
}
