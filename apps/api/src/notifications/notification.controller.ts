import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('NOTIFICATION.READ')
  findAll(@Query('eventType') eventType?: string, @Query('take') take?: string) {
    // 머리글 알림 목록은 20건만 쓴다 — 기본 20, 최대 100
    const n = Number.parseInt(take ?? '', 10);
    return this.prisma.notification.findMany({
      where: eventType ? { eventType } : undefined,
      orderBy: { sentAt: 'desc' },
      take: Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 20,
    });
  }
}
