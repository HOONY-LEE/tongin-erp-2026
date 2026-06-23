import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tongin/shared';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'tongin-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/db')
  async healthDb(): Promise<{ db: 'ok'; orgUnitCount: number }> {
    const orgUnitCount = await this.prisma.orgUnit.count();
    return { db: 'ok', orgUnitCount };
  }
}
