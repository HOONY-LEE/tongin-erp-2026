import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('overview')
  @RequirePermissions('STATS.READ')
  overview() {
    return this.service.overview();
  }
}
