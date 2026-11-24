/**
 * 지난 기록 더하기(seed-demo-history-more.ts)가 만든 데모 행만 지운다 — 실운영 전환 때 한 번 돌린다.
 *
 *   pnpm --filter @tongin/api demo:clear:history-more
 *
 * 표시: id가 'd0d01026-5eed-'로 시작한다(거래처·청구·결재·휴가·근태·인사 기록·상담 콜·확인콜·영업 CRM·캠페인·
 * 팀 업무·공지·지점 관리 기록·이사 마감·알림·기준정보 몇 가지). 가맹점 계약 정보(franchise_info)는 id가 없어
 * 사업자번호가 '000-90-'으로 시작하는 것(가짜 번호대)을 지운다. 번호가 있는 청구·결재는 옛 번호가 'HM-'.
 * 결재 단계·수금·상담 기록·캠페인 수신자·업무 댓글·이력은 DB가 함께 지운다(cascade).
 * 데모 거래처를 가리키는 접수·작업·계정·영업 CRM의 연결은 끊고(NULL) 지운다 — 다른 시드나 실사용자가 만든 행은 남는다.
 */
import { PrismaClient } from '@prisma/client';

/** 데모 행 id의 앞머리(8-4자리) — 나머지는 표 번호·순번 */
export const MORE_ID_PREFIX = 'd0d01026-5eed';
/** 번호가 있는 표의 옛 번호 앞머리 */
export const MORE_MARK = 'HM-';
/** 가맹점 계약 정보의 가짜 사업자번호 앞머리(실제로 쓰이지 않는 000 번대) */
export const MORE_BIZ_MARK = '000-90-';

const LO = `${MORE_ID_PREFIX}-0000-0000-000000000000`;
const HI = `${MORE_ID_PREFIX}-ffff-ffff-ffffffffffff`;

/** 지우는 순서(참조하는 쪽 먼저). 거래처·휴가 종류는 아래에서 따로 */
export const MORE_TABLES = [
  'user_notification',
  'leave_request',
  'approval_doc',
  'attendance_record',
  'leave_adjustment',
  'employee_history',
  'employee_checklist_item',
  'hr_checklist_template',
  'approval_line_template',
  'cs_followup',
  'cs_call',
  'crm_lead',
  'campaign',
  'team_task',
  'notice',
  'branch_case',
  'move_closure',
  'invoice',
  'price_condition',
  'commission_rule',
  'hr_policy',
] as const;

/** 표시가 붙은 행이 하나라도 있나 */
export async function hasDemoHistoryMore(prisma: PrismaClient) {
  for (const t of [...MORE_TABLES, 'partner', 'leave_type']) {
    const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE id BETWEEN $1::uuid AND $2::uuid`,
      LO,
      HI,
    );
    if (r[0].n > 0) return true;
  }
  return false;
}

export async function clearDemoHistoryMore(prisma: PrismaClient) {
  return prisma.$transaction(
    async (tx) => {
      const n: Record<string, number> = {};
      const del = async (t: string, sql: string, ...args: unknown[]) =>
        (n[t] = (n[t] ?? 0) + (await tx.$executeRawUnsafe(sql, ...args)));
      for (const t of MORE_TABLES)
        await del(t, `DELETE FROM ${t} WHERE id BETWEEN $1::uuid AND $2::uuid`, LO, HI);

      // 데모 거래처 — 남이 만든 청구는 그 거래처와 함께 지우고, 다른 행의 연결은 끊는다
      const demoPartner = `SELECT id FROM partner WHERE id BETWEEN $1::uuid AND $2::uuid`;
      await del('invoice', `DELETE FROM invoice WHERE partner_id IN (${demoPartner})`, LO, HI);
      await del(
        'price_condition',
        `DELETE FROM price_condition WHERE partner_id IN (${demoPartner})`,
        LO,
        HI,
      );
      for (const t of ['lead', 'work_order', 'app_user', 'crm_lead'])
        await del(
          `${t}(연결 끊음)`,
          `UPDATE ${t} SET partner_id = NULL WHERE partner_id IN (${demoPartner})`,
          LO,
          HI,
        );
      await del('partner', `DELETE FROM partner WHERE id BETWEEN $1::uuid AND $2::uuid`, LO, HI);

      // 데모 휴가 종류 — 실사용자가 그 종류로 신청한 휴가가 남아 있으면 남긴다
      await del(
        'leave_type',
        `DELETE FROM leave_type t WHERE t.id BETWEEN $1::uuid AND $2::uuid
           AND NOT EXISTS (SELECT 1 FROM leave_request r WHERE r.leave_type_id = t.id)`,
        LO,
        HI,
      );
      await del(
        'franchise_info',
        `DELETE FROM franchise_info WHERE biz_no LIKE $1`,
        `${MORE_BIZ_MARK}%`,
      );
      return n;
    },
    { timeout: 180_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const t = Date.now();
    const n = await clearDemoHistoryMore(prisma);
    console.log(
      `[demo-history-more] 지웠다 — ${Object.entries(n)
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
