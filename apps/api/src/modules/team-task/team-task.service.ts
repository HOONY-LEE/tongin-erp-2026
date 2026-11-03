import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TASK_STATUS_LABEL, type AuthPrincipal, type TaskStatus } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { InboxService } from '../../inbox/inbox.service';
import { dateOrNull, hasPerm } from '../../common/util/perm';
import {
  CreateTeamTaskCommentDto,
  CreateTeamTaskDto,
  UpdateTeamTaskDto,
} from './dto/team-task.dto';

export type TaskScope = 'mine' | 'team' | 'all';

const person = { select: { id: true, name: true, orgUnit: { select: { name: true } } } };
const include = {
  team: { select: { id: true, name: true } },
  duty: { select: { id: true, title: true } },
  assignee: person,
  requester: person,
} satisfies Prisma.TeamTaskInclude;

/**
 * 작업관리. 내가 담당·요청한 업무는 권한 없이 보고 고친다(직원 계정).
 * TASK.READ = 데이터 범위 안 팀들의 업무(우리 팀·전체 보기), TASK.UPDATE = 그 업무 수정.
 */
@Injectable()
export class TeamTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly inbox: InboxService,
  ) {}

  private link = (id: string) => `/tasks?detail=${id}`;

  private mine(p: AuthPrincipal): Prisma.TeamTaskWhereInput | null {
    // 팀 없이 만든 개인 업무도 만든 사람에게는 보인다
    if (!p.employeeId) return { createdByUserId: p.userId };
    return {
      OR: [
        { assigneeEmpId: p.employeeId },
        { requesterEmpId: p.employeeId },
        { createdByUserId: p.userId },
      ],
    };
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
        throw new ForbiddenException(
          '작업관리 전체 조회 권한이 없습니다 — 내 업무만 볼 수 있습니다.',
        );
      }
      const inScope = await this.scopeWhere(p);
      if (scope === 'team') {
        if (!p.employeeOrgUnitId) {
          throw new ForbiddenException('소속 팀이 없는 계정입니다 — 전체 보기를 쓰세요.');
        }
        // 우리 팀 = 주 소속 + 겸직(추가 소속) 팀
        const teams = [p.employeeOrgUnitId, ...(p.concurrentOrgUnitIds ?? [])];
        where = { AND: [{ teamOrgId: { in: teams } }, inScope] };
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
    const inScope = ids === null || (!!t.teamOrgId && ids.includes(t.teamOrgId));
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
    if (dto.dutyId) {
      const d = await this.prisma.duty.findUnique({ where: { id: dto.dutyId } });
      if (!d || !d.isActive) throw new BadRequestException('없는 업무 분장 항목입니다.');
    }
  }

  private data(dto: UpdateTeamTaskDto) {
    return {
      title: dto.title?.trim(),
      description: dto.description,
      teamOrgId: dto.teamOrgId === undefined ? undefined : dto.teamOrgId || null,
      assigneeEmpId: dto.assigneeEmpId === undefined ? undefined : dto.assigneeEmpId || null,
      requesterEmpId: dto.requesterEmpId === undefined ? undefined : dto.requesterEmpId || null,
      project: dto.project === undefined ? undefined : dto.project?.trim() || null,
      dutyId: dto.dutyId === undefined ? undefined : dto.dutyId || null,
      status: dto.status,
      priority: dto.priority,
      dueDate: dateOrNull(dto.dueDate),
    };
  }

  async create(p: AuthPrincipal, dto: CreateTeamTaskDto) {
    await this.checkRefs(dto);
    // 다른 팀에 일을 맡기는 경우가 많아(디자인 요청 등) 팀은 범위와 상관없이 고를 수 있다
    const created = await this.prisma.teamTask.create({
      data: {
        ...this.data(dto),
        title: dto.title.trim(),
        doneAt: dto.status === 'DONE' ? new Date() : null,
        createdByUserId: p.userId,
      },
      include,
    });
    await this.log(p, created.id, [{ kind: 'CREATED', toValue: created.assigneeEmpId }]);
    if (created.assigneeEmpId) {
      await this.inbox.toEmployees([created.assigneeEmpId], {
        kind: 'TASK_ASSIGNED',
        title: `업무 배정 · ${created.title}`,
        body: `${created.team ? `${created.team.name} ` : ''}업무를 맡게 되었습니다${created.dueDate ? ` · 기한 ${created.dueDate.toISOString().slice(0, 10)}` : ''}.`,
        link: this.link(created.id),
        entityType: 'team_task',
        entityId: created.id,
        actorUserId: p.userId,
      });
    }
    return created;
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
    const updated = await this.prisma.teamTask.update({
      where: { id },
      data: { ...this.data(dto), doneAt },
      include,
    });
    await this.log(p, id, this.diff(task, updated));
    await this.notifyChanges(p, task, updated);
    return updated;
  }

  /**
   * 담당 넘기기 — 다른 사람에게 이 업무를 맡긴다(말 한마디 남길 수 있음).
   * 담당자·요청자·만든 사람이거나 TASK.UPDATE가 있으면 된다. 새 담당자에게 알림, 이력에 '누가 누구에게 언제'
   */
  async assign(p: AuthPrincipal, id: string, assigneeEmpId: string | null, note?: string | null) {
    const { task, mine } = await this.load(p, id);
    if (!mine && !hasPerm(p, 'TASK.UPDATE'))
      throw new ForbiddenException(
        '이 업무를 넘길 권한이 없습니다 — 담당자·요청자만 넘길 수 있습니다.',
      );
    if ((task.assigneeEmpId ?? null) === (assigneeEmpId ?? null))
      throw new BadRequestException('지금 담당자와 같습니다.');
    if (assigneeEmpId) await this.checkRefs({ assigneeEmpId });
    const updated = await this.prisma.teamTask.update({
      where: { id },
      data: { assigneeEmpId },
      include,
    });
    await this.log(p, id, [
      {
        kind: 'ASSIGNED',
        fromValue: task.assigneeEmpId,
        toValue: assigneeEmpId,
        note: note?.trim() || null,
      },
    ]);
    await this.notifyChanges(p, task, updated, note?.trim() || null);
    return updated;
  }

  /** 이력 — 오래된 것부터, 사람·팀 이름을 붙여서 */
  async history(p: AuthPrincipal, id: string) {
    await this.load(p, id);
    const rows = await this.prisma.teamTaskEvent.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const empIds = new Set<string>();
    const orgIds = new Set<string>();
    for (const r of rows) {
      const target = r.kind === 'TEAM' ? orgIds : r.kind === 'STATUS' ? null : empIds;
      for (const v of [r.fromValue, r.toValue]) if (target && v) target.add(v);
    }
    const [emps, orgs, users] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: [...empIds] } },
        select: { id: true, name: true },
      }),
      this.prisma.orgUnit.findMany({
        where: { id: { in: [...orgIds] } },
        select: { id: true, name: true },
      }),
      this.prisma.appUser.findMany({
        where: { id: { in: rows.map((r) => r.actorUserId).filter((x): x is string => !!x) } },
        select: { id: true, loginId: true, employee: { select: { name: true } } },
      }),
    ]);
    const empName = new Map(emps.map((e) => [e.id, e.name]));
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const userName = new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
    const name = (kind: string, v: string | null) =>
      v === null
        ? null
        : kind === 'TEAM'
          ? (orgName.get(v) ?? '(지운 조직)')
          : kind === 'STATUS'
            ? (TASK_STATUS_LABEL[v as TaskStatus] ?? v)
            : (empName.get(v) ?? '(퇴사·삭제)');
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      from: name(r.kind, r.fromValue),
      to: name(r.kind, r.toValue),
      note: r.note,
      actor: (r.actorUserId && userName.get(r.actorUserId)) || r.actorName || null,
      at: r.createdAt.toISOString(),
    }));
  }

  /** 고치기 전·후를 비교해 이력 줄로 */
  private diff(
    before: { assigneeEmpId: string | null; status: string; teamOrgId: string | null },
    after: { assigneeEmpId: string | null; status: string; teamOrgId: string | null },
  ) {
    const out: { kind: string; fromValue: string | null; toValue: string | null }[] = [];
    if (before.assigneeEmpId !== after.assigneeEmpId)
      out.push({ kind: 'ASSIGNED', fromValue: before.assigneeEmpId, toValue: after.assigneeEmpId });
    if (before.status !== after.status)
      out.push({ kind: 'STATUS', fromValue: before.status, toValue: after.status });
    if (before.teamOrgId !== after.teamOrgId)
      out.push({ kind: 'TEAM', fromValue: before.teamOrgId, toValue: after.teamOrgId });
    return out;
  }

  private async log(
    p: AuthPrincipal,
    taskId: string,
    events: {
      kind: string;
      fromValue?: string | null;
      toValue?: string | null;
      note?: string | null;
    }[],
  ) {
    if (!events.length) return;
    await this.prisma.teamTaskEvent.createMany({
      data: events.map((e) => ({
        taskId,
        kind: e.kind,
        fromValue: e.fromValue ?? null,
        toValue: e.toValue ?? null,
        note: e.note ?? null,
        actorUserId: p.userId,
        actorName: p.employeeName ?? p.loginId,
      })),
    });
  }

  /** 담당자가 바뀌면 새 담당자에게, 상태가 바뀌면 담당자·요청자(바꾼 사람 빼고)에게 알린다 */
  private async notifyChanges(
    p: AuthPrincipal,
    before: { assigneeEmpId: string | null; status: string },
    after: {
      id: string;
      title: string;
      status: string;
      assigneeEmpId: string | null;
      requesterEmpId: string | null;
      dueDate: Date | null;
    },
    note?: string | null,
  ) {
    const base = { entityType: 'team_task', entityId: after.id, actorUserId: p.userId };
    if (after.assigneeEmpId && after.assigneeEmpId !== before.assigneeEmpId) {
      await this.inbox.toEmployees([after.assigneeEmpId], {
        ...base,
        kind: 'TASK_ASSIGNED',
        title: `업무 배정 · ${after.title}`,
        body: `${p.employeeName ?? '누군가'}님이 이 업무를 넘겼습니다${after.dueDate ? ` · 기한 ${after.dueDate.toISOString().slice(0, 10)}` : ''}.${note ? ` "${note}"` : ''}`,
        link: this.link(after.id),
      });
    }
    if (after.status !== before.status) {
      const label = (s: string) => TASK_STATUS_LABEL[s as TaskStatus] ?? s;
      await this.inbox.toEmployees([after.assigneeEmpId, after.requesterEmpId], {
        ...base,
        kind: 'TASK_UPDATED',
        title: `${after.status === 'DONE' ? '업무 완료' : '업무 상태 변경'} · ${after.title}`,
        body: `${label(before.status)} → ${label(after.status)}`,
        link: this.link(after.id),
      });
    }
  }

  // ── 댓글·멘션 ──

  async comments(p: AuthPrincipal, id: string) {
    await this.load(p, id);
    const rows = await this.prisma.teamTaskComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const empIds = [
      ...new Set(
        rows.flatMap((r) => [r.authorEmpId, ...r.mentions]).filter((v): v is string => !!v),
      ),
    ];
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: empIds } },
      select: { id: true, name: true },
    });
    const name = new Map(emps.map((e) => [e.id, e.name]));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      authorEmpId: r.authorEmpId,
      authorName: (r.authorEmpId && name.get(r.authorEmpId)) || '알 수 없음',
      mine: r.authorUserId === p.userId,
      mentions: r.mentions.map((m) => ({ id: m, name: name.get(m) ?? '' })),
    }));
  }

  /**
   * 댓글 — 화면에서 고른 멘션(mentionEmpIds)에 더해, 본문의 '@이름'이 재직 중인 직원 한 명과 정확히 맞으면 멘션으로 본다.
   * 멘션한 사람 → '나를 언급', 담당자·요청자 → '내 업무에 댓글'(멘션으로 이미 받은 사람·쓴 사람 빼고).
   */
  async addComment(p: AuthPrincipal, id: string, dto: CreateTeamTaskCommentDto) {
    const { task } = await this.load(p, id);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('댓글 내용을 적어 주세요.');
    const picked = [...new Set(dto.mentionEmpIds ?? [])];
    const typed = [...body.matchAll(/@([가-힣A-Za-z]{2,10})/g)].map((m) => m[1]);
    const byName = typed.length
      ? await this.prisma.employee.findMany({
          where: { name: { in: typed }, isActive: true },
          select: { id: true, name: true },
        })
      : [];
    const unique = byName.filter((e) => byName.filter((x) => x.name === e.name).length === 1);
    const valid = picked.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: picked }, isActive: true },
          select: { id: true },
        })
      : [];
    const mentions = [...new Set([...valid.map((e) => e.id), ...unique.map((e) => e.id)])];

    const c = await this.prisma.teamTaskComment.create({
      data: {
        taskId: id,
        authorEmpId: p.employeeId ?? null,
        authorUserId: p.userId,
        body,
        mentions,
      },
    });
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    const base = {
      entityType: 'team_task',
      entityId: id,
      actorUserId: p.userId,
      link: this.link(id),
    };
    await this.inbox.toEmployees(mentions, {
      ...base,
      kind: 'MENTION',
      title: `나를 언급 · ${task.title}`,
      body: preview,
    });
    const others = [task.assigneeEmpId, task.requesterEmpId].filter(
      (e): e is string => !!e && !mentions.includes(e) && e !== p.employeeId,
    );
    await this.inbox.toEmployees(others, {
      ...base,
      kind: 'TASK_COMMENT',
      title: `내 업무에 댓글 · ${task.title}`,
      body: preview,
    });
    return c;
  }

  async removeComment(p: AuthPrincipal, id: string, commentId: string) {
    const c = await this.prisma.teamTaskComment.findFirst({ where: { id: commentId, taskId: id } });
    if (!c) throw new NotFoundException('댓글을 찾을 수 없습니다.');
    if (c.authorUserId !== p.userId)
      throw new ForbiddenException('내가 쓴 댓글만 지울 수 있습니다.');
    await this.prisma.teamTaskComment.delete({ where: { id: commentId } });
    return { ok: true };
  }

  async remove(p: AuthPrincipal, id: string) {
    await this.load(p, id);
    await this.prisma.teamTask.delete({ where: { id } });
    return { ok: true };
  }
}
