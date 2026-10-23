import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { BranchAnomalyService } from './branch-anomaly.service';
import { BranchAnomalyQueryDto } from './dto/branch-anomaly-query.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly service: StatsService,
    private readonly anomaly: BranchAnomalyService,
  ) {}

  @Get('overview')
  @RequirePermissions('STATS.READ')
  overview(@CurrentUser() user: AuthPrincipal) {
    return this.service.overview(user);
  }

  /** 이상 지점 탐지 — 미계약·멈춘 건은 많은데 매출이 낮은 지점(전산 밖 계약·수수료 누락 의심) */
  @Get('branch-anomalies')
  @RequirePermissions('STATS.READ')
  branchAnomalies(@CurrentUser() user: AuthPrincipal, @Query() q: BranchAnomalyQueryDto) {
    return this.anomaly.analyze(
      { from: q.from, to: q.to, minLeads: q.minLeads ? Number(q.minLeads) : undefined },
      user,
    );
  }
}
