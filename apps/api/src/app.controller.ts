import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tongin/shared';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'tongin-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health/db')
  async healthDb(): Promise<{ db: 'ok'; orgUnitCount: number }> {
    const orgUnitCount = await this.prisma.orgUnit.count();
    return { db: 'ok', orgUnitCount };
  }
}
