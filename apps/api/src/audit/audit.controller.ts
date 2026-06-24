import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller()
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('audit-logs')
  @RequirePermissions('AUDIT.READ')
  auditLogs(@Query('entityType') entityType?: string) {
    return this.prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('domain-events')
  @RequirePermissions('AUDIT.READ')
  domainEvents(@Query('aggregateType') aggregateType?: string) {
    return this.prisma.domainEvent.findMany({
      where: aggregateType ? { aggregateType } : undefined,
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }
}
