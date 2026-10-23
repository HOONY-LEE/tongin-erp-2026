import { Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeAgentGraph,
  validateAgentGraph,
  type AgentGraph,
  type AgentToolInfo,
  type AuthPrincipal,
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
}

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

  async list() {
    const rows = await this.prisma.agentBlueprint.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        graph: true,
        prompt: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { runs: true } },
      },
    });
    const users = await this.userNames(rows.map((r) => r.createdBy));
    return rows.map(({ graph, _count, ...r }) => {
      const g = normalizeAgentGraph(graph);
      return {
        ...r,
        nodeCount: g.nodes.length,
        toolCount: g.nodes.filter((n) => n.type === 'tool').length,
        trigger: g.nodes.find((n) => n.type === 'trigger')?.config ?? null,
        runCount: _count.runs,
        createdByName: r.createdBy ? (users.get(r.createdBy) ?? null) : null,
      };
    });
  }

  async get(id: string) {
    const b = await this.prisma.agentBlueprint.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('에이전트를 찾을 수 없습니다.');
    return { ...b, graph: normalizeAgentGraph(b.graph) };
  }

  async create(input: BlueprintInput, userId: string) {
    const b = await this.prisma.agentBlueprint.create({
      data: {
        name: input.name?.trim() || '새 에이전트',
        description: input.description?.trim() ?? '',
        status: input.status ?? 'DRAFT',
        graph: normalizeAgentGraph(input.graph) as object,
        prompt: input.prompt ?? null,
        createdBy: userId,
      },
    });
    return this.get(b.id);
  }

  async update(id: string, input: BlueprintInput) {
    await this.get(id);
    await this.prisma.agentBlueprint.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() || '새 에이전트' } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.graph !== undefined ? { graph: normalizeAgentGraph(input.graph) as object } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      },
    });
    return this.get(id);
  }

  async duplicate(id: string, userId: string) {
    const b = await this.get(id);
    return this.create(
      {
        name: `${b.name} (복사본)`,
        description: b.description,
        status: 'DRAFT',
        graph: b.graph,
        prompt: b.prompt,
      },
      userId,
    );
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.agentBlueprint.delete({ where: { id } });
  }

  async runs(blueprintId: string) {
    await this.get(blueprintId);
    return this.prisma.agentRun.findMany({
      where: { blueprintId },
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

  private async userNames(ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map<string, string>();
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: uniq } },
      select: { id: true, loginId: true },
    });
    return new Map(users.map((u) => [u.id, u.loginId]));
  }
}
