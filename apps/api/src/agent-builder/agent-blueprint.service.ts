import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISSION_WILDCARD,
  normalizeAgentGraph,
  validateAgentGraph,
  type AgentGraph,
  type AgentToolInfo,
  type AgentVisibility,
  type AuthPrincipal,
  type TriggerConfig,
} from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import type { AiTool } from '../ai/ai-tool.types';

export interface BlueprintInput {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE';
  graph?: unknown;
  prompt?: string | null;
  visibility?: AgentVisibility;
  /** 부분 공유 대상 직원 — 오면 통째로 바꾼다 */
  shareEmployeeIds?: string[];
}

type BlueprintRow = {
  id: string;
  visibility: string;
  createdBy: string | null;
  shares: { employeeId: string }[];
};

/**
 * 공개 범위
 *  - 개인용: 만든 사람만 보고·실행
 *  - 전체 공개: 모두 보고 실행(고치기는 만든 사람만)
 *  - 부분 공유: 만든 사람 + 고른 직원만
 * 슈퍼관리자('*')는 관리 목적으로 전부 보고 고칠 수 있다.
 * 실행할 때 도구는 늘 '실행하는 사람' 본인 권한으로 불리므로, 공유받아도 내 권한 밖 일은 못 한다.
 */
const isAdmin = (p: AuthPrincipal) => p.permissions.includes(PERMISSION_WILDCARD);

/** AIX-04: 에이전트 블루프린트 저장소 + 도구 목록(AI 비서와 같은 레지스트리, 사용자 권한으로 거름) */
@Injectable()
export class AgentBlueprintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /** 이 사용자가 실제로 부를 수 있는 도구(ERP API 카탈로그 + 업무 도구) */
  toolsFor(principal: AuthPrincipal): AiTool[] {
    return this.ai.toolsFor(principal);
  }

  toolInfos(principal: AuthPrincipal): AgentToolInfo[] {
    return this.toolsFor(principal)
      .map((t) => {
        const [desc, kw] = t.description.split('\n검색어: ');
        return {
          name: t.name,
          description: desc.trim(),
          keywords: kw?.trim(),
          mode: t.mode,
          group: t.group ?? '기타',
          inputSchema: t.inputSchema as AgentToolInfo['inputSchema'],
        };
      })
      .sort((a, b) =>
        a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group, 'ko'),
      );
  }

  toolMap(principal: AuthPrincipal) {
    return new Map(this.toolInfos(principal).map((t) => [t.name, t]));
  }

  validate(graph: AgentGraph, principal: AuthPrincipal) {
    return validateAgentGraph(graph, this.toolMap(principal));
  }

  /** 이 사람이 볼 수 있는 블루프린트 조건(Prisma where) */
  visibleWhere(p: AuthPrincipal) {
    if (isAdmin(p)) return {};
    return {
      OR: [
        { createdBy: p.userId },
        { visibility: 'PUBLIC' },
        ...(p.employeeId
          ? [{ visibility: 'SHARED', shares: { some: { employeeId: p.employeeId } } }]
          : []),
      ],
    };
  }

  canSee(b: BlueprintRow, p: AuthPrincipal) {
    return (
      isAdmin(p) ||
      b.createdBy === p.userId ||
      b.visibility === 'PUBLIC' ||
      (b.visibility === 'SHARED' &&
        !!p.employeeId &&
        b.shares.some((s) => s.employeeId === p.employeeId))
    );
  }

  canEdit(b: { createdBy: string | null }, p: AuthPrincipal) {
    return isAdmin(p) || (!!b.createdBy && b.createdBy === p.userId);
  }

  async list(p: AuthPrincipal) {
    const rows = await this.prisma.agentBlueprint.findMany({
      where: this.visibleWhere(p),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        graph: true,
        prompt: true,
        visibility: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { runs: true, shares: true } },
      },
    });
    const users = await this.userNames(rows.map((r) => r.createdBy));
    return rows.map(({ graph, _count, ...r }) => {
      const g = normalizeAgentGraph(graph);
      return {
        ...r,
        shareCount: _count.shares,
        isMine: r.createdBy === p.userId,
        canEdit: this.canEdit(r, p),
        nodeCount: g.nodes.length,
        toolCount: g.nodes.filter((n) => n.type === 'tool').length,
        trigger: g.nodes.find((n) => n.type === 'trigger')?.config ?? null,
        runCount: _count.runs,
        createdByName: r.createdBy ? (users.get(r.createdBy) ?? null) : null,
      };
    });
  }

  /** 블루프린트 하나 — principal이 오면 볼 수 있는지 검사하고 공유 정보·권한을 붙인다 */
  async get(id: string, p?: AuthPrincipal) {
    const b = await this.prisma.agentBlueprint.findUnique({
      where: { id },
      include: {
        shares: {
          select: {
            employeeId: true,
            employee: {
              select: {
                name: true,
                orgUnit: { select: { name: true } },
                position: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!b || (p && !this.canSee(b, p)))
      throw new NotFoundException('에이전트를 찾을 수 없거나 볼 권한이 없습니다.');
    const owner = b.createdBy ? (await this.userNames([b.createdBy])).get(b.createdBy) : null;
    const { shares, ...rest } = b;
    return {
      ...rest,
      graph: normalizeAgentGraph(b.graph),
      createdByName: owner ?? null,
      shares: shares.map((s) => ({
        employeeId: s.employeeId,
        name: s.employee.name,
        orgUnitName: s.employee.orgUnit.name,
        positionName: s.employee.position?.name ?? null,
      })),
      isMine: !!p && b.createdBy === p.userId,
      canEdit: p ? this.canEdit(b, p) : false,
    };
  }

  /** 고칠 수 있는지(만든 사람·슈퍼관리자) */
  async assertEditable(id: string, p: AuthPrincipal) {
    const b = await this.get(id, p);
    if (!b.canEdit)
      throw new ForbiddenException('만든 사람만 고치거나 지울 수 있습니다. 복제해서 쓰세요.');
    return b;
  }

  async create(input: BlueprintInput, p: AuthPrincipal) {
    const visibility = input.visibility ?? 'PRIVATE';
    const shareIds = await this.validShares(visibility, input.shareEmployeeIds);
    const b = await this.prisma.agentBlueprint.create({
      data: {
        name: input.name?.trim() || '새 에이전트',
        description: input.description?.trim() ?? '',
        status: input.status ?? 'DRAFT',
        graph: normalizeAgentGraph(input.graph) as object,
        prompt: input.prompt ?? null,
        visibility,
        createdBy: p.userId,
        shares: { create: shareIds.map((employeeId) => ({ employeeId })) },
      },
    });
    return this.get(b.id, p);
  }

  async update(id: string, input: BlueprintInput, p: AuthPrincipal) {
    const cur = await this.assertEditable(id, p);
    const visibility = input.visibility ?? (cur.visibility as AgentVisibility);
    // 공개 범위나 공유 대상이 바뀌면 공유 목록을 다시 쓴다(부분 공유가 아니면 비운다)
    const sharesChanged = input.visibility !== undefined || input.shareEmployeeIds !== undefined;
    const shareIds = sharesChanged
      ? await this.validShares(
          visibility,
          input.shareEmployeeIds ?? cur.shares.map((s) => s.employeeId),
        )
      : null;
    await this.prisma.agentBlueprint.update({
      where: { id },
      data: {
        ...(input.visibility !== undefined ? { visibility } : {}),
        ...(shareIds
          ? {
              shares: {
                deleteMany: {},
                create: shareIds.map((employeeId) => ({ employeeId })),
              },
            }
          : {}),
        ...(input.name !== undefined ? { name: input.name.trim() || '새 에이전트' } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.graph !== undefined ? { graph: normalizeAgentGraph(input.graph) as object } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      },
    });
    return this.get(id, p);
  }

  /** 복제본은 늘 내 개인용 초안으로 시작한다 */
  async duplicate(id: string, p: AuthPrincipal) {
    const b = await this.get(id, p);
    return this.create(
      {
        name: `${b.name} (복사본)`,
        description: b.description,
        status: 'DRAFT',
        graph: b.graph,
        prompt: b.prompt,
        visibility: 'PRIVATE',
      },
      p,
    );
  }

  async remove(id: string, p: AuthPrincipal) {
    await this.assertEditable(id, p);
    await this.prisma.agentBlueprint.delete({ where: { id } });
  }

  /** 실행 기록 — 고칠 수 있는 사람은 전부, 공유받은 사람은 내 실행만 */
  async runs(blueprintId: string, p: AuthPrincipal) {
    const b = await this.get(blueprintId, p);
    return this.prisma.agentRun.findMany({
      where: { blueprintId, ...(b.canEdit ? {} : { createdBy: p.userId }) },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        dryRun: true,
        input: true,
        output: true,
        error: true,
        trace: true,
        createdAt: true,
      },
    });
  }

  /** AI 에이전트 화면에서 부를 수 있는 에이전트 — 사용중(ACTIVE)이고 내가 볼 수 있는 것 */
  async callable(p: AuthPrincipal) {
    const rows = await this.prisma.agentBlueprint.findMany({
      where: { status: 'ACTIVE', ...this.visibleWhere(p) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        visibility: true,
        graph: true,
        createdBy: true,
        updatedAt: true,
      },
    });
    const users = await this.userNames(rows.map((r) => r.createdBy));
    return rows.map(({ graph, ...r }) => {
      const g = normalizeAgentGraph(graph);
      const trigger = (g.nodes.find((n) => n.type === 'trigger')?.config ??
        null) as TriggerConfig | null;
      return {
        ...r,
        isMine: r.createdBy === p.userId,
        ownerName: r.createdBy ? (users.get(r.createdBy) ?? null) : null,
        inputFields: trigger?.inputFields ?? [],
        toolCount: g.nodes.filter((n) => n.type === 'tool').length,
      };
    });
  }

  /** AI 에이전트 화면에서 부를 수 있는지 — 볼 수 있고 사용중이어야 한다 */
  async assertCallable(id: string, p: AuthPrincipal) {
    const b = await this.get(id, p);
    if (b.status !== 'ACTIVE')
      throw new BadRequestException(
        '사용중이 아닌 에이전트입니다. 에이전트 빌더에서 사용중으로 바꿔 주세요.',
      );
    return b;
  }

  myRuns(blueprintId: string, p: AuthPrincipal) {
    return this.prisma.agentRun.findMany({
      where: { blueprintId, createdBy: p.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, status: true, dryRun: true, error: true, createdAt: true },
    });
  }

  /** 부분 공유로 고를 수 있는 직원 — 로그인 계정이 있는 재직 직원 */
  async shareCandidates() {
    const rows = await this.prisma.employee.findMany({
      where: { isActive: true, appUsers: { some: { isActive: true } } },
      select: {
        id: true,
        name: true,
        orgUnit: { select: { name: true } },
        position: { select: { name: true, sortOrder: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((e) => ({
      id: e.id,
      name: e.name,
      orgUnitName: e.orgUnit.name,
      positionName: e.position?.name ?? null,
    }));
  }

  private async validShares(visibility: AgentVisibility, ids?: string[]) {
    if (visibility !== 'SHARED') return [];
    const uniq = [...new Set(ids ?? [])];
    if (!uniq.length)
      throw new BadRequestException('부분 공유는 공유할 직원을 한 명 이상 골라 주세요.');
    const found = await this.prisma.employee.count({ where: { id: { in: uniq } } });
    if (found !== uniq.length)
      throw new BadRequestException('공유 대상 직원을 목록에서 다시 골라 주세요.');
    return uniq;
  }

  private async userNames(ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map<string, string>();
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: uniq } },
      select: { id: true, loginId: true, employee: { select: { name: true } } },
    });
    return new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
  }
}
