/**
 * 지방 실적 채우기(seed-demo-regions.ts)가 만든 데모 행만 지운다 — 실운영 전환 때 한 번 돌린다.
 *
 *   pnpm --filter @tongin/api demo:clear:regions
 *
 * 표시: id가 'd0d01028-5eed-'로 시작한다(고객·접수·견적·계약·결제·작업오더·배정).
 * 번호가 있는 고객·접수·견적·계약·작업은 옛 번호(legacy_no)도 'RG-'로 시작한다.
 * 데모 접수·계약에 시연 중 사람이 덧붙인 견적·계약·결제·작업·확인콜도 그 접수와 함께 지운다(남기면 고아 행이 된다).
 * 다른 시드나 실사용자가 만든 행은 건드리지 않는다 — 데모 고객을 다른 견적·계약이 아직 가리키면 그 고객은 남긴다.
 */
import { PrismaClient } from '@prisma/client';

/** 데모 행 id의 앞머리(8-4자리) — 나머지는 표 번호·순번 */
export const RG_ID_PREFIX = 'd0d01028-5eed';
/** 번호가 있는 표의 옛 번호 앞머리 */
export const RG_MARK = 'RG-';

const LO = `${RG_ID_PREFIX}-0000-0000-000000000000`;
const HI = `${RG_ID_PREFIX}-ffff-ffff-ffffffffffff`;

/** 표시가 붙은 행이 하나라도 있나 — 접수·고객 중 하나라도 있으면 이미 돌린 것 */
export async function hasDemoRegions(prisma: PrismaClient) {
  for (const t of ['lead', 'customer']) {
    const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE id BETWEEN $1::uuid AND $2::uuid`,
      LO,
      HI,
    );
    if (r[0].n > 0) return true;
  }
  return false;
}

export async function clearDemoRegions(prisma: PrismaClient) {
  return prisma.$transaction(
    async (tx) => {
      const n: Record<string, number> = {};
      const run = async (k: string, sql: string, ...args: unknown[]) =>
        (n[k] = (n[k] ?? 0) + (await tx.$executeRawUnsafe(sql, ...args)));
      const inRange = `id BETWEEN '${LO}'::uuid AND '${HI}'::uuid`;

      // 데모 접수·계약 id를 임시 표에 모아 둔다(시연 중 덧붙인 계약도 함께)
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE _rg_lead ON COMMIT DROP AS SELECT id FROM lead WHERE ${inRange}`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE _rg_contract ON COMMIT DROP AS
           SELECT id FROM contract WHERE ${inRange} OR lead_id IN (SELECT id FROM _rg_lead)`,
      );

      // 시연 중 붙은 확인콜은 지우고, 콜·A/S·청구서는 연결만 끊는다
      await run(
        'cs_followup',
        `DELETE FROM cs_followup WHERE lead_id IN (SELECT id FROM _rg_lead)`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE cs_call SET lead_id = NULL WHERE lead_id IN (SELECT id FROM _rg_lead)`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE support_ticket SET contract_id = NULL WHERE contract_id IN (SELECT id FROM _rg_contract)`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE invoice SET contract_id = NULL WHERE contract_id IN (SELECT id FROM _rg_contract)`,
      );

      // 작업(배정은 DB가 함께) → 결제 → 계약 → 견적 → 접수 → 고객
      await run(
        'work_order',
        `DELETE FROM work_order WHERE ${inRange}
           OR lead_id IN (SELECT id FROM _rg_lead) OR contract_id IN (SELECT id FROM _rg_contract)`,
      );
      await run(
        'payment',
        `DELETE FROM payment WHERE ${inRange} OR contract_id IN (SELECT id FROM _rg_contract)`,
      );
      await run('contract', `DELETE FROM contract WHERE id IN (SELECT id FROM _rg_contract)`);
      await run(
        'estimate',
        `DELETE FROM estimate WHERE ${inRange} OR lead_id IN (SELECT id FROM _rg_lead)`,
      );
      await run('lead', `DELETE FROM lead WHERE id IN (SELECT id FROM _rg_lead)`);
      await run(
        'customer',
        `DELETE FROM customer c WHERE c.id BETWEEN '${LO}'::uuid AND '${HI}'::uuid
           AND NOT EXISTS (SELECT 1 FROM estimate e WHERE e.customer_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM contract k WHERE k.customer_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM lead l WHERE l.customer_id = c.id)`,
      );
      return n;
    },
    { timeout: 120_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const t = Date.now();
    const n = await clearDemoRegions(prisma);
    console.log(
      `[demo-regions] 지웠다 — ${Object.entries(n)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')} (${Math.round((Date.now() - t) / 100) / 10}초)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
