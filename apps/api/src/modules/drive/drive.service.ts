import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { DriveItem, DriveSpace } from '@prisma/client';
import {
  DRIVE_FILE_MAX_BYTES,
  DRIVE_NAME_MAX,
  DRIVE_QUOTA_BYTES,
  DRIVE_ROLE_RANK,
  DRIVE_TRASH_DAYS,
  PERMISSION_WILDCARD,
  type AuthPrincipal,
  type DriveItemView,
  type DriveRole,
  type DriveShareView,
  type DriveSpaceKind,
  type DriveSpaceView,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 조직 트리를 들고 있는 시간 */
const ORG_CACHE_MS = 5 * 60_000;
/** 목록 한 번에 최대 */
const LIST_MAX = 1000;
const VIEW_MAX = 200;

/** 요청한 사람 — 권한 계산에 쓰는 것만 */
export interface DriveActor {
  userId: string;
  employeeId: string | null;
  /** 모든 조직·공유 드라이브 관리자(개인 드라이브는 제외) */
  admin: boolean;
  /** 내 조직(겸직 포함)과 그 상위 조직 */
  orgIds: Set<string>;
}

const maxRole = (...roles: (DriveRole | null | undefined)[]): DriveRole | null =>
  roles.reduce<DriveRole | null>(
    (best, r) => (r && (!best || DRIVE_ROLE_RANK[r] > DRIVE_ROLE_RANK[best]) ? r : best),
    null,
  );
const atLeast = (role: DriveRole | null, need: DriveRole) =>
  !!role && DRIVE_ROLE_RANK[role] >= DRIVE_ROLE_RANK[need];

export function cleanName(raw: string): string {
  const name = String(raw ?? '')
    // 경로 문자·제어 문자는 공백으로
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DRIVE_NAME_MAX);
  if (!name || name === '.' || name === '..') throw new BadRequestException('이름을 넣어 주세요.');
  return name;
}

/**
 * 드라이브 — 공간(내·조직·공유)과 그 안의 폴더·파일. 권한은
 *  공간 권한(내 드라이브 = 본인, 조직 드라이브 = 그 조직·하위 조직 사람 편집자, 공유 드라이브 = 구성원)과
 *  항목 공유(폴더를 공유하면 그 아래 전부) 중 높은 것.
 */
@Injectable()
export class DriveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Drive');
  private orgTree: { at: number; parent: Map<string, string | null> } | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // 휴지통 비우기 — 30일 지난 것. 한 시간마다
    this.timer = setInterval(() => void this.purgeOld(), 3600_000);
    setTimeout(() => void this.purgeOld(), 120_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── 누가 ──

  private async parentMap() {
    if (this.orgTree && Date.now() - this.orgTree.at < ORG_CACHE_MS) return this.orgTree.parent;
    const rows = await this.prisma.orgUnit.findMany({ select: { id: true, parentId: true } });
    this.orgTree = { at: Date.now(), parent: new Map(rows.map((r) => [r.id, r.parentId])) };
    return this.orgTree.parent;
  }

  async actor(p: AuthPrincipal): Promise<DriveActor> {
    const parent = await this.parentMap();
    const orgIds = new Set<string>();
    for (const start of [p.employeeOrgUnitId, ...(p.concurrentOrgUnitIds ?? [])]) {
      let cur: string | null | undefined = start;
      for (let i = 0; cur && i < 20 && !orgIds.has(cur); i++) {
        orgIds.add(cur);
        cur = parent.get(cur) ?? null;
      }
    }
    return {
      userId: p.userId,
      employeeId: p.employeeId,
      admin: p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('DRIVE.MANAGE'),
      orgIds,
    };
  }

  private async spaceRole(
    space: Pick<DriveSpace, 'id' | 'kind' | 'ownerUserId' | 'orgUnitId'>,
    a: DriveActor,
  ): Promise<DriveRole | null> {
    if (space.kind === 'PERSONAL') return space.ownerUserId === a.userId ? 'MANAGER' : null;
    const member = a.employeeId
      ? await this.prisma.driveSpaceMember.findUnique({
          where: { spaceId_employeeId: { spaceId: space.id, employeeId: a.employeeId } },
          select: { role: true },
        })
      : null;
    return maxRole(
      member?.role as DriveRole | undefined,
      space.kind === 'ORG' && space.orgUnitId && a.orgIds.has(space.orgUnitId) ? 'EDITOR' : null,
      a.admin ? 'MANAGER' : null,
    );
  }

  /** 항목의 위 폴더들(가까운 것부터) */
  private async ancestors(item: Pick<DriveItem, 'parentId'>): Promise<DriveItem[]> {
    const out: DriveItem[] = [];
    let pid = item.parentId;
    for (let i = 0; pid && i < 50; i++) {
      const p = await this.prisma.driveItem.findUnique({ where: { id: pid } });
      if (!p) break;
      out.push(p);
      pid = p.parentId;
    }
    return out;
  }

  /** 항목(과 위 폴더들)에 걸린 내 공유 권한 중 가장 높은 것 */
  private async shareRole(ids: string[], a: DriveActor): Promise<DriveRole | null> {
    if (!a.employeeId || !ids.length) return null;
    const rows = await this.prisma.driveShare.findMany({
      where: { itemId: { in: ids }, employeeId: a.employeeId },
      select: { role: true },
    });
    return maxRole(...rows.map((r) => r.role as DriveRole));
  }

  /** 항목 하나를 열 수 있는지 + 내 권한. 휴지통에 든 것(위 폴더 포함)은 includeTrashed일 때만 */
  async access(itemId: string, a: DriveActor, need: DriveRole, includeTrashed = false) {
    const item = await this.prisma.driveItem.findUnique({
      where: { id: itemId },
      include: { space: true },
    });
    if (!item) throw new NotFoundException('파일을 찾을 수 없습니다.');
    const ups = await this.ancestors(item);
    if (!includeTrashed && (item.trashedAt || ups.some((u) => u.trashedAt)))
      throw new NotFoundException('휴지통에 있는 파일입니다.');
    const role = maxRole(
      await this.spaceRole(item.space, a),
      await this.shareRole([item.id, ...ups.map((u) => u.id)], a),
    );
    if (!role) throw new NotFoundException('파일을 찾을 수 없습니다.');
    if (!atLeast(role, need))
      throw new ForbiddenException(
        need === 'MANAGER' ? '관리자만 할 수 있습니다.' : '이 파일을 고칠 권한이 없습니다.',
      );
    return { item, space: item.space, role, ancestors: ups };
  }

  private async spaceAccess(spaceId: string, a: DriveActor, need: DriveRole) {
    const space = await this.prisma.driveSpace.findUnique({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('드라이브를 찾을 수 없습니다.');
    const role = await this.spaceRole(space, a);
    if (!role) throw new NotFoundException('드라이브를 찾을 수 없습니다.');
    if (!atLeast(role, need)) throw new ForbiddenException('이 드라이브를 고칠 권한이 없습니다.');
    return { space, role };
  }

  /** 새 항목을 둘 곳(공간 루트 또는 폴더) — 편집자 이상 */
  async target(spaceId: string, parentId: string | null | undefined, a: DriveActor) {
    if (parentId) {
      const { item, space } = await this.access(parentId, a, 'EDITOR');
      if (item.kind !== 'FOLDER') throw new BadRequestException('폴더 안에만 넣을 수 있습니다.');
      if (item.spaceId !== spaceId) throw new BadRequestException('드라이브가 맞지 않습니다.');
      return { space, parentId: item.id };
    }
    const { space } = await this.spaceAccess(spaceId, a, 'EDITOR');
    return { space, parentId: null };
  }

  // ── 공간 ──

  async usage(spaceIds: string[]): Promise<Map<string, number>> {
    const g = await this.prisma.driveItem.groupBy({
      by: ['spaceId'],
      where: { spaceId: { in: spaceIds }, kind: 'FILE' },
      _sum: { size: true },
    });
    return new Map(g.map((x) => [x.spaceId, x._sum.size ?? 0]));
  }

  private async assertQuota(space: DriveSpace, adding: number) {
    const used = (await this.usage([space.id])).get(space.id) ?? 0;
    const quota = DRIVE_QUOTA_BYTES[space.kind as DriveSpaceKind];
    if (used + adding > quota)
      throw new BadRequestException(
        `드라이브 용량(${Math.round(quota / 1024 / 1024)}MB)이 모자랍니다. 휴지통을 비우거나 필요 없는 파일을 지워 주세요.`,
      );
  }

  /** 내가 쓸 수 있는 공간 — 내 드라이브·내 조직(상위 포함) 드라이브는 처음 열 때 만든다 */
  async spaces(p: AuthPrincipal): Promise<DriveSpaceView[]> {
    const a = await this.actor(p);
    await this.prisma.driveSpace.upsert({
      where: { ownerUserId: a.userId },
      create: { kind: 'PERSONAL', name: '내 드라이브', ownerUserId: a.userId, createdBy: a.userId },
      update: {},
    });
    if (a.orgIds.size) {
      const have = await this.prisma.driveSpace.findMany({
        where: { orgUnitId: { in: [...a.orgIds] } },
        select: { orgUnitId: true },
      });
      const missing = [...a.orgIds].filter((id) => !have.some((h) => h.orgUnitId === id));
      if (missing.length) {
        const orgs = await this.prisma.orgUnit.findMany({
          where: { id: { in: missing } },
          select: { id: true, name: true },
        });
        await this.prisma.driveSpace.createMany({
          data: orgs.map((o) => ({ kind: 'ORG', name: o.name, orgUnitId: o.id })),
          skipDuplicates: true,
        });
      }
    }
    const memberOf = a.employeeId
      ? await this.prisma.driveSpaceMember.findMany({
          where: { employeeId: a.employeeId },
          select: { spaceId: true },
        })
      : [];
    const rows = await this.prisma.driveSpace.findMany({
      where: {
        OR: [
          { ownerUserId: a.userId },
          { orgUnitId: { in: [...a.orgIds] } },
          { id: { in: memberOf.map((m) => m.spaceId) } },
          ...(a.admin ? [{ kind: { in: ['ORG', 'SHARED'] } }] : []),
        ],
      },
      include: { _count: { select: { members: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    const used = await this.usage(rows.map((r) => r.id));
    const out: DriveSpaceView[] = [];
    for (const s of rows) {
      const role = await this.spaceRole(s, a);
      if (!role) continue;
      out.push({
        id: s.id,
        kind: s.kind as DriveSpaceKind,
        name: s.name,
        description: s.description,
        role,
        usedBytes: used.get(s.id) ?? 0,
        quotaBytes: DRIVE_QUOTA_BYTES[s.kind as DriveSpaceKind],
        memberCount: s._count.members,
      });
    }
    const order: Record<string, number> = { PERSONAL: 0, SHARED: 1, ORG: 2 };
    return out.sort((x, y) => order[x.kind] - order[y.kind] || x.name.localeCompare(y.name, 'ko'));
  }

  async createShared(
    p: AuthPrincipal,
    dto: {
      name: string;
      description?: string | null;
      members: { employeeId: string; role: DriveRole }[];
    },
  ) {
    if (!p.employeeId)
      throw new ForbiddenException('직원과 연결된 계정만 공유 드라이브를 만들 수 있습니다.');
    const members = new Map(dto.members.map((m) => [m.employeeId, m.role]));
    members.set(p.employeeId, 'MANAGER');
    const space = await this.prisma.driveSpace.create({
      data: {
        kind: 'SHARED',
        name: cleanName(dto.name),
        description: dto.description?.trim().slice(0, 500) || null,
        createdBy: p.userId,
        members: { create: [...members].map(([employeeId, role]) => ({ employeeId, role })) },
      },
    });
    return space.id;
  }

  async spaceDetail(spaceId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const { space, role } = await this.spaceAccess(spaceId, a, 'VIEWER');
    const members = await this.prisma.driveSpaceMember.findMany({ where: { spaceId } });
    const people = await this.people(members.map((m) => m.employeeId));
    return {
      id: space.id,
      kind: space.kind,
      name: space.name,
      description: space.description,
      role,
      members: members
        .map((m) => ({ ...(people.get(m.employeeId) ?? this.unknown(m.employeeId)), role: m.role }))
        .sort(
          (x, y) => DRIVE_ROLE_RANK[y.role as DriveRole] - DRIVE_ROLE_RANK[x.role as DriveRole],
        ),
    };
  }

  async updateSpace(
    spaceId: string,
    p: AuthPrincipal,
    dto: {
      name?: string;
      description?: string | null;
      members?: { employeeId: string; role: DriveRole }[];
    },
  ) {
    const a = await this.actor(p);
    const { space } = await this.spaceAccess(spaceId, a, 'MANAGER');
    if (space.kind === 'PERSONAL') throw new BadRequestException('내 드라이브는 바꿀 수 없습니다.');
    if (dto.members && space.kind === 'SHARED' && !dto.members.some((m) => m.role === 'MANAGER'))
      throw new BadRequestException('관리자를 한 명 이상 두어야 합니다.');
    await this.prisma.$transaction(async (tx) => {
      await tx.driveSpace.update({
        where: { id: spaceId },
        data: {
          ...(dto.name !== undefined && space.kind === 'SHARED'
            ? { name: cleanName(dto.name) }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim().slice(0, 500) || null }
            : {}),
        },
      });
      if (dto.members) {
        await tx.driveSpaceMember.deleteMany({ where: { spaceId } });
        const uniq = new Map(dto.members.map((m) => [m.employeeId, m.role]));
        await tx.driveSpaceMember.createMany({
          data: [...uniq].map(([employeeId, role]) => ({ spaceId, employeeId, role })),
        });
      }
    });
  }

  async deleteSpace(spaceId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const { space } = await this.spaceAccess(spaceId, a, 'MANAGER');
    if (space.kind !== 'SHARED') throw new BadRequestException('공유 드라이브만 지울 수 있습니다.');
    await this.prisma.driveSpace.delete({ where: { id: spaceId } });
  }

  // ── 목록 ──

  /** 공간 루트나 폴더 안 */
  async list(p: AuthPrincipal, spaceId: string, folderId?: string | null) {
    const a = await this.actor(p);
    let role: DriveRole;
    let space: DriveSpace;
    let path: { id: string; name: string }[] = [];
    if (folderId) {
      const r = await this.access(folderId, a, 'VIEWER');
      if (r.item.kind !== 'FOLDER') throw new BadRequestException('폴더가 아닙니다.');
      role = r.role;
      space = r.space;
      path = [...r.ancestors].reverse().map((x) => ({ id: x.id, name: x.name }));
      path.push({ id: r.item.id, name: r.item.name });
      // 공유로만 들어온 사람은 공유된 폴더 위로는 못 간다
      const spaceRole = await this.spaceRole(space, a);
      if (!spaceRole) {
        const shared = await this.prisma.driveShare.findMany({
          where: { employeeId: a.employeeId ?? '', itemId: { in: path.map((x) => x.id) } },
          select: { itemId: true },
        });
        const top = path.findIndex((x) => shared.some((s) => s.itemId === x.id));
        path = path.slice(Math.max(0, top));
      }
    } else {
      const r = await this.spaceAccess(spaceId, a, 'VIEWER');
      role = r.role;
      space = r.space;
    }
    const items = await this.prisma.driveItem.findMany({
      where: { spaceId: space.id, parentId: folderId ?? null, trashedAt: null },
      orderBy: { name: 'asc' },
      take: LIST_MAX,
    });
    // 폴더 먼저, 그다음 이름순(한글 순서)
    items.sort(
      (x, y) =>
        Number(y.kind === 'FOLDER') - Number(x.kind === 'FOLDER') ||
        x.name.localeCompare(y.name, 'ko', { numeric: true }),
    );
    return {
      space: { id: space.id, name: space.name, kind: space.kind },
      folder: folderId ? path[path.length - 1] : null,
      path,
      role,
      items: await this.views(items, a, space, role, true),
    };
  }

  /** 최근 연 파일 + 내가 최근에 고친 파일 */
  async recent(p: AuthPrincipal) {
    const a = await this.actor(p);
    const [opened, edited] = await Promise.all([
      this.prisma.driveRecent.findMany({
        where: { userId: a.userId },
        orderBy: { openedAt: 'desc' },
        take: VIEW_MAX,
        include: { item: true },
      }),
      this.prisma.driveItem.findMany({
        where: { updatedBy: a.userId, kind: { not: 'FOLDER' }, trashedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: VIEW_MAX,
      }),
    ]);
    const seen = new Map<string, { item: DriveItem; at: number }>();
    for (const r of opened) seen.set(r.itemId, { item: r.item, at: r.openedAt.getTime() });
    for (const it of edited) {
      const cur = seen.get(it.id);
      if (!cur || cur.at < it.updatedAt.getTime())
        seen.set(it.id, { item: it, at: it.updatedAt.getTime() });
    }
    const items = [...seen.values()]
      .filter((x) => !x.item.trashedAt)
      .sort((x, y) => y.at - x.at)
      .map((x) => x.item);
    return this.viewsChecked(items, a);
  }

  async starred(p: AuthPrincipal) {
    const a = await this.actor(p);
    const stars = await this.prisma.driveStar.findMany({
      where: { userId: a.userId },
      include: { item: true },
      take: VIEW_MAX,
    });
    return this.viewsChecked(
      stars.map((s) => s.item).filter((i) => !i.trashedAt),
      a,
    );
  }

  /** 다른 사람이 나에게 공유한 것 */
  async sharedWithMe(p: AuthPrincipal) {
    const a = await this.actor(p);
    if (!a.employeeId) return [];
    const shares = await this.prisma.driveShare.findMany({
      where: { employeeId: a.employeeId },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
      take: VIEW_MAX,
    });
    return this.viewsChecked(
      shares.map((s) => s.item).filter((i) => !i.trashedAt && i.createdBy !== a.userId),
      a,
    );
  }

  /** 휴지통 — 내가 고칠 수 있는 드라이브에서 지운 것(맨 위 항목만) */
  async trash(p: AuthPrincipal) {
    const a = await this.actor(p);
    const spaces = await this.spaces(p);
    const editable = spaces.filter((s) => atLeast(s.role, 'EDITOR')).map((s) => s.id);
    const items = await this.prisma.driveItem.findMany({
      where: {
        spaceId: { in: editable },
        trashedAt: { not: null },
        OR: [{ parentId: null }, { parent: { trashedAt: null } }],
      },
      orderBy: { trashedAt: 'desc' },
      take: VIEW_MAX,
    });
    return this.viewsChecked(items, a, true);
  }

  async search(p: AuthPrincipal, q: string) {
    const kw = q.trim().slice(0, 100);
    if (!kw) return [];
    const a = await this.actor(p);
    const spaces = await this.spaces(p);
    const sharedIds = a.employeeId
      ? (
          await this.prisma.driveShare.findMany({
            where: { employeeId: a.employeeId },
            select: { itemId: true },
          })
        ).map((s) => s.itemId)
      : [];
    const items = await this.prisma.driveItem.findMany({
      where: {
        name: { contains: kw, mode: 'insensitive' },
        trashedAt: null,
        OR: [{ spaceId: { in: spaces.map((s) => s.id) } }, { id: { in: sharedIds } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: VIEW_MAX,
    });
    return this.viewsChecked(items, a);
  }

  /** 여러 공간에서 온 항목 — 하나씩 권한을 확인한다(휴지통 위 폴더 포함) */
  private async viewsChecked(items: DriveItem[], a: DriveActor, includeTrashed = false) {
    const out: DriveItemView[] = [];
    for (const it of items) {
      try {
        const r = await this.access(it.id, a, 'VIEWER', includeTrashed);
        out.push(...(await this.views([it], a, r.space, r.role, false)));
      } catch {
        /* 볼 수 없게 된 것(공유 해제·위 폴더 휴지통)은 뺀다 */
      }
    }
    return out;
  }

  private async views(
    items: DriveItem[],
    a: DriveActor,
    space: DriveSpace,
    baseRole: DriveRole,
    checkChildShares: boolean,
  ): Promise<DriveItemView[]> {
    if (!items.length) return [];
    const ids = items.map((i) => i.id);
    const [stars, shares, mine] = await Promise.all([
      this.prisma.driveStar.findMany({ where: { userId: a.userId, itemId: { in: ids } } }),
      this.prisma.driveShare.groupBy({ by: ['itemId'], where: { itemId: { in: ids } } }),
      checkChildShares && a.employeeId
        ? this.prisma.driveShare.findMany({
            where: { itemId: { in: ids }, employeeId: a.employeeId },
          })
        : Promise.resolve([]),
    ]);
    const names = await this.userNames(
      items.flatMap((i) => [i.createdBy, i.updatedBy]).filter((x): x is string => !!x),
    );
    const starSet = new Set(stars.map((s) => s.itemId));
    const shareSet = new Set(shares.map((s) => s.itemId));
    return items.map((i) => ({
      id: i.id,
      spaceId: i.spaceId,
      spaceName: space.name,
      spaceKind: space.kind as DriveSpaceKind,
      parentId: i.parentId,
      kind: i.kind as DriveItemView['kind'],
      name: i.name,
      mimeType: i.mimeType,
      size: i.size,
      url: i.url,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      createdByName: i.createdBy ? (names.get(i.createdBy) ?? null) : null,
      updatedByName: i.updatedBy ? (names.get(i.updatedBy) ?? null) : null,
      starred: starSet.has(i.id),
      shared: shareSet.has(i.id),
      trashedAt: i.trashedAt?.toISOString() ?? null,
      role:
        maxRole(
          baseRole,
          ...mine.filter((m) => m.itemId === i.id).map((m) => m.role as DriveRole),
        ) ?? baseRole,
    }));
  }

  private async userNames(ids: string[]) {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map<string, string>();
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: uniq } },
      select: { id: true, loginId: true, employee: { select: { name: true } } },
    });
    return new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
  }

  private unknown(employeeId: string) {
    return { employeeId, name: '(퇴사·삭제된 직원)', positionName: null, orgUnitName: null };
  }

  private async people(employeeIds: string[]) {
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(employeeIds)] } },
      select: {
        id: true,
        name: true,
        position: { select: { name: true } },
        orgUnit: { select: { name: true } },
      },
    });
    return new Map(
      rows.map((e) => [
        e.id,
        {
          employeeId: e.id,
          name: e.name,
          positionName: e.position?.name ?? null,
          orgUnitName: e.orgUnit?.name ?? null,
        },
      ]),
    );
  }

  async itemView(itemId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const r = await this.access(itemId, a, 'VIEWER', true);
    const [view] = await this.views([r.item], a, r.space, r.role, false);
    const path = [...r.ancestors].reverse().map((x) => ({ id: x.id, name: x.name }));
    return { ...view, path };
  }

  // ── 만들기·올리기 ──

  async createFolder(p: AuthPrincipal, spaceId: string, parentId: string | null, name: string) {
    const a = await this.actor(p);
    const t = await this.target(spaceId, parentId, a);
    const item = await this.prisma.driveItem.create({
      data: {
        spaceId: t.space.id,
        parentId: t.parentId,
        kind: 'FOLDER',
        name: cleanName(name),
        createdBy: a.userId,
        updatedBy: a.userId,
      },
    });
    return item.id;
  }

  async upload(
    p: AuthPrincipal,
    spaceId: string,
    parentId: string | null,
    name: string,
    mimeType: string,
    bytes: Buffer,
  ) {
    if (!bytes.length) throw new BadRequestException('빈 파일은 올릴 수 없습니다.');
    if (bytes.length > DRIVE_FILE_MAX_BYTES)
      throw new BadRequestException(
        `파일 하나는 ${DRIVE_FILE_MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있습니다. 큰 파일은 구글 드라이브에 두고 링크로 넣어 주세요.`,
      );
    const a = await this.actor(p);
    const t = await this.target(spaceId, parentId, a);
    await this.assertQuota(t.space, bytes.length);
    const item = await this.prisma.driveItem.create({
      data: {
        spaceId: t.space.id,
        parentId: t.parentId,
        kind: 'FILE',
        name: cleanName(name),
        mimeType: (mimeType || 'application/octet-stream').slice(0, 150),
        size: bytes.length,
        createdBy: a.userId,
        updatedBy: a.userId,
        content: { create: { bytes: new Uint8Array(bytes) } },
      },
    });
    return item.id;
  }

  async createLink(
    p: AuthPrincipal,
    spaceId: string,
    parentId: string | null,
    data: { name: string; url: string; mimeType?: string | null; googleFileId?: string | null },
  ) {
    const a = await this.actor(p);
    const t = await this.target(spaceId, parentId, a);
    const item = await this.prisma.driveItem.create({
      data: {
        spaceId: t.space.id,
        parentId: t.parentId,
        kind: 'LINK',
        name: cleanName(data.name),
        url: data.url,
        mimeType: data.mimeType ?? null,
        googleFileId: data.googleFileId ?? null,
        createdBy: a.userId,
        updatedBy: a.userId,
      },
    });
    return item.id;
  }

  /** 파일 받기(미리보기 포함) — 최근 연 파일에 남긴다 */
  async content(itemId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const { item } = await this.access(itemId, a, 'VIEWER');
    if (item.kind !== 'FILE') throw new BadRequestException('받을 수 있는 파일이 아닙니다.');
    const c = await this.prisma.driveContent.findUnique({ where: { itemId } });
    if (!c) throw new NotFoundException('파일 내용이 없습니다.');
    await this.touch(itemId, a.userId);
    return {
      name: item.name,
      mimeType: item.mimeType ?? 'application/octet-stream',
      bytes: c.bytes,
    };
  }

  async touch(itemId: string, userId: string) {
    await this.prisma.driveRecent.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId },
      update: { openedAt: new Date() },
    });
  }

  // ── 고치기 ──

  async rename(itemId: string, p: AuthPrincipal, name: string) {
    const a = await this.actor(p);
    await this.access(itemId, a, 'EDITOR');
    await this.prisma.driveItem.update({
      where: { id: itemId },
      data: { name: cleanName(name), updatedBy: a.userId },
    });
  }

  async star(itemId: string, p: AuthPrincipal, on: boolean) {
    const a = await this.actor(p);
    await this.access(itemId, a, 'VIEWER');
    if (on)
      await this.prisma.driveStar.upsert({
        where: { userId_itemId: { userId: a.userId, itemId } },
        create: { userId: a.userId, itemId },
        update: {},
      });
    else await this.prisma.driveStar.deleteMany({ where: { userId: a.userId, itemId } });
  }

  /** 아래 항목 전부(자기 포함) */
  private async subtree(rootId: string): Promise<DriveItem[]> {
    const all: DriveItem[] = [];
    let frontier = [rootId];
    const root = await this.prisma.driveItem.findUnique({ where: { id: rootId } });
    if (root) all.push(root);
    for (let depth = 0; frontier.length && depth < 50; depth++) {
      const kids = await this.prisma.driveItem.findMany({ where: { parentId: { in: frontier } } });
      all.push(...kids);
      frontier = kids.filter((k) => k.kind === 'FOLDER').map((k) => k.id);
    }
    return all;
  }

  /** 옮기기 — 다른 드라이브로도(양쪽 편집자). 자기 아래 폴더로는 못 옮긴다 */
  async move(itemId: string, p: AuthPrincipal, spaceId: string, parentId: string | null) {
    const a = await this.actor(p);
    const { item } = await this.access(itemId, a, 'EDITOR');
    const t = await this.target(spaceId, parentId, a);
    const tree = await this.subtree(itemId);
    if (t.parentId && tree.some((x) => x.id === t.parentId))
      throw new BadRequestException('자기 안의 폴더로는 옮길 수 없습니다.');
    if (t.space.id !== item.spaceId) {
      const size = tree.reduce((s, x) => s + (x.kind === 'FILE' ? (x.size ?? 0) : 0), 0);
      await this.assertQuota(t.space, size);
    }
    await this.prisma.$transaction([
      this.prisma.driveItem.update({
        where: { id: itemId },
        data: { parentId: t.parentId, spaceId: t.space.id, updatedBy: a.userId },
      }),
      ...(t.space.id !== item.spaceId
        ? [
            this.prisma.driveItem.updateMany({
              where: { id: { in: tree.map((x) => x.id).filter((id) => id !== itemId) } },
              data: { spaceId: t.space.id },
            }),
          ]
        : []),
    ]);
  }

  /** 사본 만들기(파일만) — 같은 폴더에 '사본 - 이름' */
  async copy(itemId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const { item, space } = await this.access(itemId, a, 'VIEWER');
    if (item.kind === 'FOLDER') throw new BadRequestException('폴더는 사본을 만들 수 없습니다.');
    const t = await this.target(item.spaceId, item.parentId, a).catch(() => null);
    if (!t) throw new ForbiddenException('이 폴더에 사본을 만들 권한이 없습니다.');
    const c =
      item.kind === 'FILE'
        ? await this.prisma.driveContent.findUnique({ where: { itemId } })
        : null;
    if (item.kind === 'FILE') await this.assertQuota(space, item.size ?? 0);
    const created = await this.prisma.driveItem.create({
      data: {
        spaceId: item.spaceId,
        parentId: item.parentId,
        kind: item.kind,
        name: cleanName(`사본 - ${item.name}`),
        mimeType: item.mimeType,
        size: item.size,
        url: item.url,
        googleFileId: item.googleFileId,
        createdBy: a.userId,
        updatedBy: a.userId,
        ...(c ? { content: { create: { bytes: c.bytes } } } : {}),
      },
    });
    return created.id;
  }

  async trashItem(itemId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    await this.access(itemId, a, 'EDITOR');
    await this.prisma.driveItem.update({
      where: { id: itemId },
      data: { trashedAt: new Date(), trashedBy: a.userId },
    });
  }

  /** 휴지통에서 꺼내기 — 원래 폴더가 없거나 휴지통이면 드라이브 맨 위로 */
  async restore(itemId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const { item, ancestors } = await this.access(itemId, a, 'EDITOR', true);
    const parentGone = ancestors.some((x) => x.trashedAt);
    await this.prisma.driveItem.update({
      where: { id: itemId },
      data: { trashedAt: null, trashedBy: null, ...(parentGone ? { parentId: null } : {}) },
    });
    return { movedToRoot: parentGone, spaceId: item.spaceId };
  }

  /** 영구 삭제 — 휴지통에 든 것만 */
  async purge(itemId: string, p: AuthPrincipal) {
    const a = await this.actor(p);
    const { item } = await this.access(itemId, a, 'EDITOR', true);
    if (!item.trashedAt)
      throw new BadRequestException('휴지통에 넣은 뒤에 영구 삭제할 수 있습니다.');
    await this.prisma.driveItem.delete({ where: { id: itemId } });
  }

  async emptyTrash(p: AuthPrincipal) {
    const items = await this.trash(p);
    for (const it of items)
      await this.prisma.driveItem.delete({ where: { id: it.id } }).catch(() => undefined);
    return { deleted: items.length };
  }

  private async purgeOld() {
    try {
      const cut = new Date(Date.now() - DRIVE_TRASH_DAYS * 24 * 3600_000);
      const { count } = await this.prisma.driveItem.deleteMany({
        where: { trashedAt: { lt: cut } },
      });
      if (count) this.logger.log(`휴지통에서 ${DRIVE_TRASH_DAYS}일 지난 ${count}개를 지웠습니다`);
    } catch (e) {
      this.logger.warn(`휴지통 정리 실패: ${String(e)}`);
    }
  }

  // ── 공유 ──

  async shares(itemId: string, p: AuthPrincipal): Promise<DriveShareView[]> {
    const a = await this.actor(p);
    await this.access(itemId, a, 'VIEWER');
    const rows = await this.prisma.driveShare.findMany({ where: { itemId } });
    const people = await this.people(rows.map((r) => r.employeeId));
    return rows.map((r) => ({
      ...(people.get(r.employeeId) ?? this.unknown(r.employeeId)),
      role: r.role as DriveRole,
    }));
  }

  /** 공유 대상을 통째로 바꾼다(편집자 이상) */
  async setShares(
    itemId: string,
    p: AuthPrincipal,
    list: { employeeId: string; role: DriveRole }[],
  ) {
    const a = await this.actor(p);
    await this.access(itemId, a, 'EDITOR');
    const uniq = new Map(
      list.filter((x) => x.employeeId !== a.employeeId).map((x) => [x.employeeId, x.role]),
    );
    const known = await this.prisma.employee.findMany({
      where: { id: { in: [...uniq.keys()] } },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.driveShare.deleteMany({ where: { itemId } }),
      this.prisma.driveShare.createMany({
        data: known.map((e) => ({
          itemId,
          employeeId: e.id,
          role: uniq.get(e.id) === 'EDITOR' ? 'EDITOR' : 'VIEWER',
          createdBy: a.userId,
        })),
      }),
    ]);
  }

  /** 옮기기 창 — 내가 편집자인 드라이브의 폴더 트리(이름·위 폴더) */
  async folderTree(p: AuthPrincipal) {
    const spaces = (await this.spaces(p)).filter((s) => atLeast(s.role, 'EDITOR'));
    const folders = await this.prisma.driveItem.findMany({
      where: { spaceId: { in: spaces.map((s) => s.id) }, kind: 'FOLDER', trashedAt: null },
      select: { id: true, spaceId: true, parentId: true, name: true },
      orderBy: { name: 'asc' },
      take: 5000,
    });
    return { spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })), folders };
  }
}
