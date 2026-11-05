import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';

/** 조직 트리 캐시 유지 시간 */
const ORG_TREE_TTL_MS = 60_000;

/**
 * APP-02: 조직 데이터범위 스코프.
 * 슈퍼관리자('*')·ALL 스코프 = 제한 없음(null). 그 외 ORG 스코프는 해당 조직 + 하위까지.
 */
@Injectable()
export class ScopeService {
  private tree: { at: number; value: Promise<Map<string, string[]>> } | null = null;

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

  /**
   * 본문으로 받은 고객 id가 내 범위인지 — 접수·A/S·주문에 다른 지점 고객을 잇고 목록에서 이름·번호를 읽지 못하게.
   * 고객관리와 같은 기준: 담당 지점이 범위 안이거나 아직 담당 지점이 없는 고객(null)만.
   */
  async assertCustomer(customerId: string | null | undefined, principal?: AuthPrincipal) {
    if (!customerId) return;
    const ids = await this.orgScopeIds(principal);
    if (ids === null) return;
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { ownerOrgId: true },
    });
    if (!c) throw new BadRequestException('고객을 목록에서 다시 골라 주세요.');
    if (c.ownerOrgId && !ids.includes(c.ownerOrgId)) {
      throw new ForbiddenException('소속 지점의 고객만 다룰 수 있습니다.');
    }
  }

  /** 본문으로 받은 계약 id가 내 범위 조직의 계약인지 */
  async assertContract(contractId: string | null | undefined, principal?: AuthPrincipal) {
    if (!contractId) return;
    const ids = await this.orgScopeIds(principal);
    if (ids === null) return;
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { orgUnitId: true },
    });
    if (!c) throw new BadRequestException('계약을 목록에서 다시 골라 주세요.');
    if (!ids.includes(c.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 계약만 다룰 수 있습니다.');
    }
  }

  /** 주어진 조직들 + 모든 하위 조직 id (BFS). 조직 트리는 한 번 읽어 메모리에서 돈다. */
  async withDescendants(roots: string[]): Promise<string[]> {
    const children = await this.childrenMap();
    const all = new Set(roots);
    let frontier = [...roots];
    while (frontier.length) {
      frontier = frontier.flatMap((id) => children.get(id) ?? []).filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }
    return [...all];
  }

  /** 이 조직 + 위로 올라가는 모든 상위 조직 id(공지: 상위 조직에 건 공지도 하위 사람이 본다) */
  async withAncestors(orgUnitId: string): Promise<string[]> {
    const children = await this.childrenMap();
    const parent = new Map<string, string>();
    for (const [p, list] of children) for (const c of list) parent.set(c, p);
    const out = [orgUnitId];
    for (let cur = parent.get(orgUnitId); cur && !out.includes(cur); cur = parent.get(cur)) {
      out.push(cur);
    }
    return out;
  }

  /**
   * 부모 id → 자식 id 목록. 예전엔 조직 깊이만큼 쿼리를 순서대로 보냈다(DB 왕복 ~200ms × 3~4).
   * 조직은 100여 행이라 통째로 읽어 60초 캐시하고, 조직을 고치면 invalidateOrgTree()로 비운다.
   */
  private childrenMap(): Promise<Map<string, string[]>> {
    const now = Date.now();
    if (this.tree && now - this.tree.at < ORG_TREE_TTL_MS) return this.tree.value;
    const value = this.prisma.orgUnit
      .findMany({ select: { id: true, parentId: true } })
      .then((rows) => {
        const map = new Map<string, string[]>();
        for (const r of rows) {
          if (!r.parentId) continue;
          const list = map.get(r.parentId);
          if (list) list.push(r.id);
          else map.set(r.parentId, [r.id]);
        }
        return map;
      });
    const entry = { at: now, value };
    this.tree = entry;
    // 실패한 조회는 담아 두지 않는다
    value.catch(() => {
      if (this.tree === entry) this.tree = null;
    });
    return value;
  }

  /** 조직을 만들거나 고치거나 지우면 부른다(org-unit.service). */
  invalidateOrgTree(): void {
    this.tree = null;
  }
}
