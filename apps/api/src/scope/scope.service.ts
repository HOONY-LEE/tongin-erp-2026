import { Injectable } from '@nestjs/common';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * APP-02: 조직 데이터범위 스코프.
 * 슈퍼관리자('*')·ALL 스코프 = 제한 없음(null). 그 외 ORG 스코프는 해당 조직 + 하위까지.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 접근 가능한 orgUnitId 목록. null = 무제한(전체 조회). [] = 조회 가능 조직 없음. */
  async orgScopeIds(principal?: AuthPrincipal | null): Promise<string[] | null> {
    if (!principal) return null;
    if (principal.permissions.includes(PERMISSION_WILDCARD)) return null;
    if (principal.scopes.some((s) => s.dataScope === 'ALL')) return null;

    const base = principal.scopes
      .filter((s) => s.dataScope === 'ORG' && s.orgScopeId)
      .map((s) => s.orgScopeId as string);
    if (!base.length) return [];

    return this.withDescendants(base);
  }

  /** 주어진 조직들 + 모든 하위 조직 id (BFS). */
  private async withDescendants(roots: string[]): Promise<string[]> {
    const all = new Set(roots);
    let frontier = [...roots];
    while (frontier.length) {
      const children = await this.prisma.orgUnit.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }
    return [...all];
  }
}
