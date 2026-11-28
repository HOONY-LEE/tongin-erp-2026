import { BadRequestException, Injectable } from '@nestjs/common';
import { territoryCandidates } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface TerritoryItem {
  sido: string;
  sigungu: string;
  /** 비우면 배정을 뺀다 */
  orgUnitId: string | null;
}

/** 지점 담당 영역(시·군·구 → 지점) */
@Injectable()
export class BranchTerritoryService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.branchTerritory.findMany({
      select: { sido: true, sigungu: true, orgUnitId: true },
      orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
    });
  }

  /** 여러 구역을 한 번에 바꾼다(지도에서 칠한 것) */
  async save(items: TerritoryItem[]) {
    const orgIds = [...new Set(items.map((x) => x.orgUnitId).filter((x): x is string => !!x))];
    if (orgIds.length) {
      const ok = await this.prisma.orgUnit.count({
        where: { id: { in: orgIds }, type: 'BRANCH' },
      });
      if (ok !== orgIds.length) throw new BadRequestException('지점이 아닌 조직이 있습니다.');
    }
    await this.prisma.$transaction(
      items.map((x) => {
        const where = { sido_sigungu: { sido: x.sido, sigungu: x.sigungu } };
        return x.orgUnitId
          ? this.prisma.branchTerritory.upsert({
              where,
              create: { sido: x.sido, sigungu: x.sigungu, orgUnitId: x.orgUnitId },
              update: { orgUnitId: x.orgUnitId },
            })
          : this.prisma.branchTerritory.deleteMany({
              where: { sido: x.sido, sigungu: x.sigungu },
            });
      }),
    );
    return { ok: true, count: items.length };
  }

  /**
   * 주소로 담당 지점 찾기 — 같은 구역, 바뀐 구역 이름, 시 단위 순으로.
   * '수원시'처럼 구가 없는 주소는 그 시의 구들 중 가장 많이 맡은 지점.
   */
  async resolve(sido?: string, sigungu?: string) {
    const keys = territoryCandidates(sido, sigungu);
    if (!keys.length) return null;
    const pairs = keys.map((k) => {
      const [s, g] = k.split('|');
      return { sido: s, sigungu: g };
    });
    const rows = await this.prisma.branchTerritory.findMany({
      where: { OR: pairs },
      include: { orgUnit: { select: { id: true, name: true } } },
    });
    for (const p of pairs) {
      const hit = rows.find((r) => r.sido === p.sido && r.sigungu === p.sigungu);
      if (hit) return { orgUnitId: hit.orgUnit.id, orgName: hit.orgUnit.name };
    }
    const g = (sigungu ?? '').trim();
    if (/시$/.test(g)) {
      const inCity = await this.prisma.branchTerritory.findMany({
        where: { sido: (sido ?? '').trim(), sigungu: { startsWith: `${g} ` } },
        include: { orgUnit: { select: { id: true, name: true } } },
      });
      const tally = new Map<string, { n: number; name: string }>();
      for (const r of inCity) {
        const t = tally.get(r.orgUnitId) ?? { n: 0, name: r.orgUnit.name };
        t.n += 1;
        tally.set(r.orgUnitId, t);
      }
      const best = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      if (best) return { orgUnitId: best[0], orgName: best[1].name };
    }
    return null;
  }
}
