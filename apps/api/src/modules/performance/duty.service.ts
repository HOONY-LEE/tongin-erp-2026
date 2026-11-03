import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DUTY_CYCLES,
  PERMISSION_WILDCARD,
  type AuthPrincipal,
  type DutyCycle,
  type DutyView,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 업무 분장을 두는 조직 — 본사 부서·TF(지점·외부업체 제외) */
export const DUTY_ORG_TYPES = ['DEPT', 'TF'];

export interface DutyInput {
  orgUnitId?: string;
  title?: string;
  description?: string | null;
  ownerEmpId?: string | null;
  backupEmpId?: string | null;
  cycle?: DutyCycle;
  tool?: string | null;
  linkUrl?: string | null;
  sortOrder?: number;
}

const OPEN = ['TODO', 'IN_PROGRESS', 'HOLD'];

/**
 * 업무 분장 — 조직마다 맡는 일(업무 항목)과 주·부 담당자, 조직의 역할(미션).
 * 보기는 누구나, 정하기는 DUTY.MANAGE. 팀 업무가 dutyId로 이어지면 그 항목의 '지금 하는 일'을 센다.
 */
@Injectable()
export class DutyService {
  constructor(private readonly prisma: PrismaService) {}

  canManage(p: AuthPrincipal) {
    return p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('DUTY.MANAGE');
  }
  private assertManage(p: AuthPrincipal) {
    if (!this.canManage(p)) throw new ForbiddenException('업무 분장을 정할 권한이 없습니다.');
  }

  /** 업무 분장 화면 첫 자료 — 조직(역할·인원)과 업무 항목 전부 */
  async overview(p: AuthPrincipal) {
    const [orgs, duties] = await Promise.all([
      this.prisma.orgUnit.findMany({
        where: { isActive: true, type: { in: DUTY_ORG_TYPES } },
        select: {
          id: true,
          name: true,
          type: true,
          mission: true,
          _count: { select: { employees: { where: { isActive: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.list(),
    ]);
    return {
      canManage: this.canManage(p),
      orgs: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        mission: o.mission,
        memberCount: o._count.employees,
      })),
      duties,
    };
  }

  async list(where: { ownerOrBackup?: string } = {}): Promise<DutyView[]> {
    const rows = await this.prisma.duty.findMany({
      where: {
        isActive: true,
        ...(where.ownerOrBackup
          ? { OR: [{ ownerEmpId: where.ownerOrBackup }, { backupEmpId: where.ownerOrBackup }] }
          : {}),
      },
      include: {
        orgUnit: { select: { name: true } },
        owner: { select: { name: true } },
        backup: { select: { name: true } },
      },
      orderBy: [{ orgUnitId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = rows.length
      ? await this.prisma.teamTask.groupBy({
          by: ['dutyId', 'status'],
          where: { dutyId: { in: rows.map((r) => r.id) }, status: { in: OPEN } },
          _count: { _all: true },
        })
      : [];
    const open = new Map<string, number>();
    const doing = new Map<string, number>();
    for (const c of counts) {
      if (!c.dutyId) continue;
      open.set(c.dutyId, (open.get(c.dutyId) ?? 0) + c._count._all);
      if (c.status === 'IN_PROGRESS') doing.set(c.dutyId, c._count._all);
    }
    return rows.map((r) => ({
      id: r.id,
      orgUnitId: r.orgUnitId,
      orgUnitName: r.orgUnit.name,
      title: r.title,
      description: r.description,
      ownerEmpId: r.ownerEmpId,
      ownerName: r.owner?.name ?? null,
      backupEmpId: r.backupEmpId,
      backupName: r.backup?.name ?? null,
      cycle: (DUTY_CYCLES as readonly string[]).includes(r.cycle)
        ? (r.cycle as DutyCycle)
        : 'ALWAYS',
      tool: r.tool,
      linkUrl: r.linkUrl,
      sortOrder: r.sortOrder,
      openTasks: open.get(r.id) ?? 0,
      inProgress: doing.get(r.id) ?? 0,
    }));
  }

  /** 한 항목에 이어진 아직 안 끝난 팀 업무 */
  async tasks(id: string) {
    await this.get(id);
    const rows = await this.prisma.teamTask.findMany({
      where: { dutyId: id, status: { in: OPEN } },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assignee: { select: { name: true } },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 50,
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
      assigneeName: t.assignee?.name ?? null,
    }));
  }

  private async get(id: string) {
    const d = await this.prisma.duty.findUnique({ where: { id } });
    if (!d || !d.isActive) throw new NotFoundException('업무 분장 항목을 찾을 수 없습니다.');
    return d;
  }

  private async check(input: DutyInput) {
    if (input.orgUnitId) {
      const org = await this.prisma.orgUnit.findUnique({ where: { id: input.orgUnitId } });
      if (!org || !org.isActive) throw new BadRequestException('조직을 찾을 수 없습니다.');
    }
    const emps = [input.ownerEmpId, input.backupEmpId].filter((x): x is string => !!x);
    if (emps.length) {
      const n = await this.prisma.employee.count({ where: { id: { in: emps }, isActive: true } });
      if (n !== new Set(emps).size) throw new BadRequestException('담당자를 찾을 수 없습니다.');
    }
    if (input.ownerEmpId && input.ownerEmpId === input.backupEmpId)
      throw new BadRequestException('주 담당과 부 담당이 같은 사람입니다.');
  }

  private data(input: DutyInput) {
    const trim = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null ? null : v.trim() || null;
    return {
      ...(input.orgUnitId !== undefined && { orgUnitId: input.orgUnitId }),
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: trim(input.description) }),
      ...(input.ownerEmpId !== undefined && { ownerEmpId: input.ownerEmpId || null }),
      ...(input.backupEmpId !== undefined && { backupEmpId: input.backupEmpId || null }),
      ...(input.cycle !== undefined && { cycle: input.cycle }),
      ...(input.tool !== undefined && { tool: trim(input.tool) }),
      ...(input.linkUrl !== undefined && { linkUrl: trim(input.linkUrl) }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    };
  }

  async create(p: AuthPrincipal, input: DutyInput) {
    this.assertManage(p);
    if (!input.orgUnitId || !input.title?.trim())
      throw new BadRequestException('조직과 업무 이름을 넣어 주세요.');
    await this.check(input);
    // 순서를 안 정하면 그 조직 맨 끝
    const last = await this.prisma.duty.aggregate({
      where: { orgUnitId: input.orgUnitId, isActive: true },
      _max: { sortOrder: true },
    });
    const d = await this.prisma.duty.create({
      data: {
        ...this.data(input),
        orgUnitId: input.orgUnitId,
        title: input.title.trim(),
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
      },
    });
    return { id: d.id };
  }

  async update(p: AuthPrincipal, id: string, input: DutyInput) {
    this.assertManage(p);
    const cur = await this.get(id);
    if (input.title !== undefined && !input.title.trim())
      throw new BadRequestException('업무 이름을 넣어 주세요.');
    await this.check({
      ...input,
      ownerEmpId: input.ownerEmpId === undefined ? cur.ownerEmpId : input.ownerEmpId,
      backupEmpId: input.backupEmpId === undefined ? cur.backupEmpId : input.backupEmpId,
    });
    await this.prisma.duty.update({ where: { id }, data: this.data(input) });
    return { ok: true };
  }

  /** 지우기 — 이어진 팀 업무는 그대로 두고 연결만 끊긴다(onDelete SetNull) */
  async remove(p: AuthPrincipal, id: string) {
    this.assertManage(p);
    await this.get(id);
    await this.prisma.duty.delete({ where: { id } });
    return { ok: true };
  }

  async setMission(p: AuthPrincipal, orgUnitId: string, mission: string | null) {
    this.assertManage(p);
    const org = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!org) throw new NotFoundException('조직을 찾을 수 없습니다.');
    await this.prisma.orgUnit.update({
      where: { id: orgUnitId },
      data: { mission: mission?.trim() || null },
    });
    return { ok: true };
  }
}
