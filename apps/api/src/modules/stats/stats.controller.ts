import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('overview')
  @RequirePermissions('STATS.READ')
  overview(@CurrentUser() user: AuthPrincipal) {
    return this.service.overview(user);
  }
}
