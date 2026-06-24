import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('NOTIFICATION.READ')
  findAll(@Query('eventType') eventType?: string) {
    return this.prisma.notification.findMany({
      where: eventType ? { eventType } : undefined,
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
  }
}
