import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { hasPerm } from '../../common/util/perm';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

const include = {
  author: { select: { id: true, name: true, orgUnit: { select: { name: true } } } },
  orgUnits: { select: { orgUnit: { select: { id: true, name: true } } } },
} satisfies Prisma.NoticeInclude;

type NoticeRow = Prisma.NoticeGetPayload<{ include: typeof include }>;

/** 화면용 — 대상 조직을 [{id,name}]으로 펴고 작성자 이름·소속을 붙인다 */
const view = (n: NoticeRow) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  audience: n.audience,
  pinned: n.pinned,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
  author: n.author
    ? { id: n.author.id, name: n.author.name, orgUnitName: n.author.orgUnit?.name ?? null }
    : null,
  orgUnits: n.orgUnits.map((o) => o.orgUnit),
});

/**
 * 공지사항. 전사 공지 + 내 소속 조직(과 그 상위 조직)에 건 공지는 직원 계정이면 권한 없이 본다.
 * NOTICE.READ는 모든 공지(다른 팀 공지 포함) 열람, 쓰기는 NOTICE.CREATE/UPDATE/DELETE.
 */
@Injectable()
export class NoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** 이 사람이 볼 수 있는 공지 조건. {} = 전부 */
  private async visibleWhere(p: AuthPrincipal): Promise<Prisma.NoticeWhereInput> {
    if (hasPerm(p, 'NOTICE.READ')) return {};
    if (!p.employeeOrgUnitId) {
      throw new ForbiddenException('직원과 연결된 계정만 공지사항을 볼 수 있습니다.');
    }
    const orgIds = await this.scope.withAncestors(p.employeeOrgUnitId);
    return {
      OR: [{ audience: 'ALL' }, { orgUnits: { some: { orgUnitId: { in: orgIds } } } }],
    };
  }

  async findAll(p: AuthPrincipal, q?: string) {
    const visible = await this.visibleWhere(p);
    const search: Prisma.NoticeWhereInput = q?.trim()
      ? {
          OR: [
            { title: { contains: q.trim(), mode: 'insensitive' } },
            { body: { contains: q.trim(), mode: 'insensitive' } },
          ],
        }
      : {};
    const rows = await this.prisma.notice.findMany({
      where: { AND: [visible, search] },
      include,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map(view);
  }

  async findOne(p: AuthPrincipal, id: string) {
    const visible = await this.visibleWhere(p);
    const row = await this.prisma.notice.findFirst({ where: { AND: [{ id }, visible] }, include });
    if (!row) throw new NotFoundException('공지를 찾을 수 없거나 볼 수 없는 공지입니다.');
    return view(row);
  }

  /** 대상 검증 — 전사 공지는 데이터 범위 '전체'만, 조직 공지는 내 범위 안 조직으로만 */
  private async checkAudience(
    p: AuthPrincipal,
    audience: string,
    orgUnitIds: string[] | undefined,
  ): Promise<string[]> {
    const ids = await this.scope.orgScopeIds(p);
    if (audience === 'ALL') {
      if (ids !== null) {
        throw new ForbiddenException(
          '전사 공지는 데이터 범위가 전체인 계정만 올릴 수 있습니다. 대상 조직을 골라 주세요.',
        );
      }
      return [];
    }
    const targets = [...new Set(orgUnitIds ?? [])];
    if (!targets.length) throw new BadRequestException('공지할 조직을 하나 이상 골라 주세요.');
    const found = await this.prisma.orgUnit.count({ where: { id: { in: targets } } });
    if (found !== targets.length) throw new BadRequestException('없는 조직이 들어 있습니다.');
    if (ids !== null && targets.some((t) => !ids.includes(t))) {
      throw new ForbiddenException('소속 조직(과 하위 조직)에만 공지할 수 있습니다.');
    }
    return targets;
  }

  async create(p: AuthPrincipal, dto: CreateNoticeDto) {
    const targets = await this.checkAudience(p, dto.audience, dto.orgUnitIds);
    const row = await this.prisma.notice.create({
      data: {
        title: dto.title.trim(),
        body: dto.body,
        audience: dto.audience,
        pinned: dto.pinned ?? false,
        authorEmpId: p.employeeId,
        authorUserId: p.userId,
        orgUnits: { create: targets.map((orgUnitId) => ({ orgUnitId })) },
      },
      include,
    });
    return view(row);
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateNoticeDto) {
    const cur = await this.prisma.notice.findUnique({
      where: { id },
      include: { orgUnits: { select: { orgUnitId: true } } },
    });
    if (!cur) throw new NotFoundException('공지를 찾을 수 없습니다.');
    const audienceChanged = dto.audience !== undefined || dto.orgUnitIds !== undefined;
    const targets = audienceChanged
      ? await this.checkAudience(
          p,
          dto.audience ?? cur.audience,
          dto.orgUnitIds ?? cur.orgUnits.map((o) => o.orgUnitId),
        )
      : null;
    const row = await this.prisma.notice.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        body: dto.body,
        audience: dto.audience,
        pinned: dto.pinned,
        ...(targets
          ? { orgUnits: { deleteMany: {}, create: targets.map((orgUnitId) => ({ orgUnitId })) } }
          : {}),
      },
      include,
    });
    return view(row);
  }

  async remove(id: string) {
    const cur = await this.prisma.notice.findUnique({ where: { id }, select: { id: true } });
    if (!cur) throw new NotFoundException('공지를 찾을 수 없습니다.');
    await this.prisma.notice.delete({ where: { id } });
    return { ok: true };
  }
}
