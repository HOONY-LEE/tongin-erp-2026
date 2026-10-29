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
import { dateOrNull, hasPerm } from '../../common/util/perm';
import { CreateTeamTaskDto, UpdateTeamTaskDto } from './dto/team-task.dto';

export type TaskScope = 'mine' | 'team' | 'all';

const person = { select: { id: true, name: true, orgUnit: { select: { name: true } } } };
const include = {
  team: { select: { id: true, name: true } },
  assignee: person,
  requester: person,
} satisfies Prisma.TeamTaskInclude;

/**
 * 팀 업무. 내가 담당·요청한 업무는 권한 없이 보고 고친다(직원 계정).
 * TASK.READ = 데이터 범위 안 팀들의 업무(우리 팀·전체 보기), TASK.UPDATE = 그 업무 수정.
 */
@Injectable()
export class TeamTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private mine(p: AuthPrincipal): Prisma.TeamTaskWhereInput | null {
    if (!p.employeeId) return null;
    return { OR: [{ assigneeEmpId: p.employeeId }, { requesterEmpId: p.employeeId }] };
  }

  private isMine(
    p: AuthPrincipal,
    t: {
      assigneeEmpId: string | null;
      requesterEmpId: string | null;
      createdByUserId: string | null;
    },
  ) {
    return (
      (!!p.employeeId && (t.assigneeEmpId === p.employeeId || t.requesterEmpId === p.employeeId)) ||
      t.createdByUserId === p.userId
    );
  }

  /** 데이터 범위 안 팀 조건. {} = 전부 */
  private async scopeWhere(p: AuthPrincipal): Promise<Prisma.TeamTaskWhereInput> {
    const ids = await this.scope.orgScopeIds(p);
    return ids === null ? {} : { teamOrgId: { in: ids } };
  }

  async findAll(p: AuthPrincipal, scope: TaskScope, status?: string, q?: string) {
    const mine = this.mine(p);
    let where: Prisma.TeamTaskWhereInput;
    if (scope === 'mine') {
      if (!mine) throw new ForbiddenException('직원과 연결된 계정만 내 업무를 볼 수 있습니다.');
      where = mine;
    } else {
      if (!hasPerm(p, 'TASK.READ')) {
        throw new ForbiddenException('팀 업무 조회 권한이 없습니다 — 내 업무만 볼 수 있습니다.');
      }
      const inScope = await this.scopeWhere(p);
      if (scope === 'team') {
        if (!p.employeeOrgUnitId) {
          throw new ForbiddenException('소속 팀이 없는 계정입니다 — 전체 보기를 쓰세요.');
        }
        where = { AND: [{ teamOrgId: p.employeeOrgUnitId }, inScope] };
      } else {
        where = inScope;
      }
      // 범위 밖이어도 내가 담당·요청한 일은 함께 보인다
      // (조건 없는 {}를 OR에 넣으면 Prisma가 아무것도 고르지 않는다 — 전체면 그대로 둔다)
      if (mine && Object.keys(where).length > 0) where = { OR: [where, mine] };
    }
    const term = q?.trim();
    const rows = await this.prisma.teamTask.findMany({
      where: {
        AND: [
          where,
          status ? { status } : {},
          term
            ? {
                OR: [
                  { title: { contains: term, mode: 'insensitive' } },
                  { description: { contains: term, mode: 'insensitive' } },
                  { project: { contains: term, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      include,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows;
  }

  /** 볼 수 있는 업무 하나 — 내 업무이거나 TASK.READ + 범위 안 */
  private async load(p: AuthPrincipal, id: string) {
    const t = await this.prisma.teamTask.findUnique({ where: { id }, include });
    if (!t) throw new NotFoundException('업무를 찾을 수 없습니다.');
    if (this.isMine(p, t)) return { task: t, mine: true };
    const ids = await this.scope.orgScopeIds(p);
    const inScope = ids === null || ids.includes(t.teamOrgId);
    if (!hasPerm(p, 'TASK.READ') || !inScope) {
      throw new ForbiddenException('이 업무를 볼 권한이 없습니다.');
    }
    return { task: t, mine: false };
  }

  async findOne(p: AuthPrincipal, id: string) {
    return (await this.load(p, id)).task;
  }

  private async checkRefs(dto: UpdateTeamTaskDto) {
    if (dto.teamOrgId) {
      const org = await this.prisma.orgUnit.findUnique({ where: { id: dto.teamOrgId } });
      if (!org) throw new BadRequestException('없는 팀입니다.');
    }
    const emps = [dto.assigneeEmpId, dto.requesterEmpId].filter((v): v is string => !!v);
    if (emps.length) {
      const n = await this.prisma.employee.count({ where: { id: { in: emps } } });
      if (n !== new Set(emps).size) throw new BadRequestException('없는 직원이 들어 있습니다.');
    }
  }

  private data(dto: UpdateTeamTaskDto) {
    return {
      title: dto.title?.trim(),
      description: dto.description,
      teamOrgId: dto.teamOrgId,
      assigneeEmpId: dto.assigneeEmpId,
      requesterEmpId: dto.requesterEmpId,
      project: dto.project === undefined ? undefined : dto.project?.trim() || null,
      status: dto.status,
      priority: dto.priority,
      dueDate: dateOrNull(dto.dueDate),
    };
  }

  async create(p: AuthPrincipal, dto: CreateTeamTaskDto) {
    await this.checkRefs(dto);
    // 다른 팀에 일을 맡기는 경우가 많아(디자인 요청 등) 팀은 범위와 상관없이 고를 수 있다
    return this.prisma.teamTask.create({
      data: {
        ...this.data(dto),
        title: dto.title.trim(),
        teamOrgId: dto.teamOrgId,
        doneAt: dto.status === 'DONE' ? new Date() : null,
        createdByUserId: p.userId,
      },
      include,
    });
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateTeamTaskDto) {
    const { task, mine } = await this.load(p, id);
    if (!mine && !hasPerm(p, 'TASK.UPDATE')) {
      throw new ForbiddenException(
        '이 업무를 고칠 권한이 없습니다 — 담당자·요청자만 고칠 수 있습니다.',
      );
    }
    await this.checkRefs(dto);
    const doneAt =
      dto.status === undefined || dto.status === task.status
        ? undefined
        : dto.status === 'DONE'
          ? new Date()
          : null;
    return this.prisma.teamTask.update({
      where: { id },
      data: { ...this.data(dto), doneAt },
      include,
    });
  }

  async remove(p: AuthPrincipal, id: string) {
    await this.load(p, id);
    await this.prisma.teamTask.delete({ where: { id } });
    return { ok: true };
  }
}
