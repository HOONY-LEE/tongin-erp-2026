/**
 * 운영 지난 실적(seed-demo-history-ops.ts)이 만든 데모 행만 지운다 — 실운영 전환 때 한 번 돌린다.
 *
 *   pnpm --filter @tongin/api demo:clear:history-ops
 *
 * 표시: id가 'd0d01025-5eed-'로 시작한다(일정·청구·상담 문자·공간 예약·리빙케어 주문·자재 발주·입출고 모두).
 * 번호가 있는 청구·리빙케어 주문·자재 발주는 옛 번호(legacy_no)도 'HO-'로 시작한다.
 * 수금 기록·발주 품목은 DB가 함께 지운다(cascade). 다른 시드나 실사용자가 만든 행은 건드리지 않는다.
 */
import { PrismaClient } from '@prisma/client';

/** 데모 행 id의 앞머리(8-4자리) — 나머지는 순번·난수 */
export const OPS_ID_PREFIX = 'd0d01025-5eed';
/** 번호가 있는 표의 옛 번호 앞머리 */
export const OPS_MARK = 'HO-';

const LO = `${OPS_ID_PREFIX}-0000-0000-000000000000`;
const HI = `${OPS_ID_PREFIX}-ffff-ffff-ffffffffffff`;

/** 지우는 순서 — 발주 품목은 발주와, 수금은 청구와 함께 지워진다 */
export const OPS_TABLES = [
  'calendar_event',
  'invoice',
  'cs_sms',
  'space_reservation',
  'service_order',
  'material_order',
  'stock_movement',
] as const;

/** 표시가 붙은 행이 하나라도 있나 */
export async function hasDemoHistoryOps(prisma: PrismaClient) {
  for (const t of OPS_TABLES) {
    const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE id BETWEEN $1::uuid AND $2::uuid`,
      LO,
      HI,
    );
    if (r[0].n > 0) return true;
  }
  return false;
}

export async function clearDemoHistoryOps(prisma: PrismaClient) {
  return prisma.$transaction(
    async (tx) => {
      const n: Record<string, number> = {};
      for (const t of OPS_TABLES) {
        n[t] = await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE id BETWEEN $1::uuid AND $2::uuid`,
          LO,
          HI,
        );
      }
      return n;
    },
    { timeout: 120_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const t = Date.now();
    const n = await clearDemoHistoryOps(prisma);
    console.log(
      `[demo-history-ops] 지웠다 — ${Object.entries(n)
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
