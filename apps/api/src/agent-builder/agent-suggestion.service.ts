import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HABIT_WINDOW_DAYS, detectHabits, type HabitSuggestion } from './habit-detector';

/** 반복 행동 → 에이전트 제안 — 내 최근 업무 요청(감사 로그)과 업무 이벤트로 되풀이하는 일을 찾는다 */
@Injectable()
export class AgentSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<HabitSuggestion[]> {
    const since = new Date(Date.now() - HABIT_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorUserId: userId,
        createdAt: { gte: since },
        statusCode: { lt: 400 },
      },
      select: { method: true, path: true, entityId: true, after: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    if (rows.length < 3) return [];
    const events = await this.prisma.domainEvent.findMany({
      where: { occurredAt: { gte: since } },
      select: { eventType: true, aggregateId: true, payload: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
      take: 20000,
    });
    return detectHabits(rows, events, { windowDays: HABIT_WINDOW_DAYS });
  }
}
