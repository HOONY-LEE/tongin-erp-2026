import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type InboxKind =
  | 'APPROVAL_REQUEST'
  | 'APPROVAL_RESULT'
  | 'APPROVAL_CC'
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'TASK_COMMENT'
  | 'MENTION'
  | 'LEAD_ASSIGNED'
  | 'WORK_ASSIGNED'
  | 'NOTICE'
  | 'LEAVE_SUBSTITUTE';

export interface InboxMessage {
  kind: InboxKind;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string;
  entityId?: string;
  /** 일으킨 사람 — 본인에게는 알리지 않는다 */
  actorUserId?: string | null;
}

/**
 * 내 알림(user_notification) — 받을 사람을 계정(userId) 또는 직원(employeeId)으로 받아 한 줄씩 남긴다.
 * 알림 실패가 본 업무를 깨뜨리지 않게 오류는 로그만 남긴다.
 */
@Injectable()
export class InboxService {
  private readonly log = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 직원 id → 그 직원의 활성 계정 id */
  async usersOfEmployees(empIds: (string | null | undefined)[]): Promise<string[]> {
    const ids = [...new Set(empIds.filter((v): v is string => !!v))];
    if (!ids.length) return [];
    const users = await this.prisma.appUser.findMany({
      where: { employeeId: { in: ids }, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async toEmployees(empIds: (string | null | undefined)[], msg: InboxMessage) {
    await this.toUsers(await this.usersOfEmployees(empIds), msg);
  }

  async toUsers(userIds: string[], msg: InboxMessage) {
    try {
      const to = [...new Set(userIds)].filter((id) => id !== msg.actorUserId);
      if (!to.length) return;
      const actorName = msg.actorUserId ? await this.actorName(msg.actorUserId) : null;
      await this.prisma.userNotification.createMany({
        data: to.map((userId) => ({
          userId,
          kind: msg.kind,
          title: msg.title.slice(0, 200),
          body: msg.body ? msg.body.slice(0, 500) : null,
          link: msg.link ?? null,
          actorUserId: msg.actorUserId ?? null,
          actorName,
          entityType: msg.entityType ?? null,
          entityId: msg.entityId ?? null,
        })),
      });
    } catch (e) {
      this.log.warn(`알림 기록 실패(${msg.kind}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async actorName(userId: string): Promise<string | null> {
    const u = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { loginId: true, employee: { select: { name: true } } },
    });
    return u?.employee?.name ?? u?.loginId ?? null;
  }

  // ── 내 알림 목록 ──

  async list(userId: string, take = 30, unreadOnly = false) {
    const [items, unread] = await Promise.all([
      this.prisma.userNotification.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(take, 1), 100),
      }),
      this.unreadCount(userId),
    ]);
    return { items, unread };
  }

  unreadCount(userId: string) {
    return this.prisma.userNotification.count({ where: { userId, readAt: null } });
  }

  /** 읽음 — ids가 없으면 전부 */
  async markRead(userId: string, ids?: string[]) {
    await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { unread: await this.unreadCount(userId) };
  }

  /** 지우기 — ids가 없으면 읽은 알림 전부 */
  async remove(userId: string, ids?: string[]) {
    await this.prisma.userNotification.deleteMany({
      where: { userId, ...(ids?.length ? { id: { in: ids } } : { readAt: { not: null } }) },
    });
    return { unread: await this.unreadCount(userId) };
  }
}
