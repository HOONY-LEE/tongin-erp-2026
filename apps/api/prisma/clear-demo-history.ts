/**
 * 지난 실적(seed-demo-history.ts)이 만든 데모 행만 지운다 — 실운영 전환 때 한 번 돌린다.
 *
 *   pnpm --filter @tongin/api demo:clear:history
 *
 * 표시: 옛 번호(legacy_no)가 'HS-'로 시작하는 고객·접수·견적·계약·작업오더·A/S·CS 접수.
 * 결제는 그 계약의 것, 작업 배정·견적 하위 행은 DB가 함께 지운다(cascade).
 * 데모 접수에 시연 중 사람이 덧붙인 견적·계약·확인콜 기록도 그 접수와 함께 지운다(남기면 고아 행이 된다).
 * 다른 시드나 실사용자가 만든 행은 건드리지 않는다 — 데모 고객을 다른 행이 아직 가리키면 그 고객은 남긴다.
 */
import { PrismaClient } from '@prisma/client';

/** 지난 실적 데모 행의 표시(옛 번호 앞머리) */
export const HISTORY_MARK = 'HS-';

export async function clearDemoHistory(prisma: PrismaClient) {
  const like = `${HISTORY_MARK}%`;
  return prisma.$transaction(
    async (tx) => {
      const n: Record<string, number> = {};
      // 데모 접수 id를 임시 표에 모아 둔다
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE _hs_lead ON COMMIT DROP AS SELECT id FROM lead WHERE legacy_no LIKE $1`,
        like,
      );
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE _hs_contract ON COMMIT DROP AS
           SELECT id FROM contract WHERE legacy_no LIKE $1 OR lead_id IN (SELECT id FROM _hs_lead)`,
        like,
      );
      n.csFollowup = await tx.$executeRawUnsafe(
        `DELETE FROM cs_followup WHERE lead_id IN (SELECT id FROM _hs_lead)`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE cs_call SET lead_id = NULL WHERE lead_id IN (SELECT id FROM _hs_lead)`,
      );
      n.supportTicket = await tx.$executeRawUnsafe(
        `DELETE FROM support_ticket WHERE legacy_no LIKE $1`,
        like,
      );
      n.workOrder = await tx.$executeRawUnsafe(
        `DELETE FROM work_order WHERE legacy_no LIKE $1
           OR lead_id IN (SELECT id FROM _hs_lead) OR contract_id IN (SELECT id FROM _hs_contract)`,
        like,
      );
      n.payment = await tx.$executeRawUnsafe(
        `DELETE FROM payment WHERE contract_id IN (SELECT id FROM _hs_contract)`,
      );
      n.contract = await tx.$executeRawUnsafe(
        `DELETE FROM contract WHERE id IN (SELECT id FROM _hs_contract)`,
      );
      n.estimate = await tx.$executeRawUnsafe(
        `DELETE FROM estimate WHERE legacy_no LIKE $1 OR lead_id IN (SELECT id FROM _hs_lead)`,
        like,
      );
      n.lead = await tx.$executeRawUnsafe(`DELETE FROM lead WHERE id IN (SELECT id FROM _hs_lead)`);
      // 고객 — 다른(데모 아닌) 견적·계약이 아직 가리키면 남긴다. 접수·A/S의 고객 칸은 DB가 비운다
      n.customer = await tx.$executeRawUnsafe(
        `DELETE FROM customer c WHERE c.legacy_no LIKE $1
           AND NOT EXISTS (SELECT 1 FROM estimate e WHERE e.customer_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM contract k WHERE k.customer_id = c.id)`,
        like,
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
    const n = await clearDemoHistory(prisma);
    console.log(
      `[demo-history] 지웠다 — ${Object.entries(n)
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
