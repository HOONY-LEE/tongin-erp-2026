import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { BranchAnomalyService } from './branch-anomaly.service';
import { SalesStatsService } from './sales-stats.service';
import { BranchAnomalyQueryDto } from './dto/branch-anomaly-query.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly service: StatsService,
    private readonly anomaly: BranchAnomalyService,
    private readonly salesStats: SalesStatsService,
  ) {}

  /**
   * 매출 통계(필터) — from·to(YYYY-MM-DD), serviceLine(MOVING 가정이사 · B2B_MOVING 기업이전 …),
   * orgUnitId(지점), partnerId(거래처), source(접수 경로), groupBy(day·week·month·branch·partner·serviceLine·source·region)
   */
  @Get('sales')
  @RequirePermissions('STATS.READ')
  sales(
    @CurrentUser() user: AuthPrincipal,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('serviceLine') serviceLine?: string,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('partnerId') partnerId?: string,
    @Query('source') source?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.salesStats.sales(user, {
      from,
      to,
      serviceLine,
      orgUnitId,
      partnerId,
      source,
      groupBy,
    });
  }

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
