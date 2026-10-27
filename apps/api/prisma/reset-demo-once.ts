/**
 * 시연 DB를 '리셋 버전마다 한 번' 처음부터 다시 만든다 — 구조(조직·지점·계정)를 바꿔 기존 더미 데이터를
 * 고쳐 쓰기보다 새로 넣는 편이 맞을 때 쓴다.
 *
 * 컨테이너가 뜰 때 마이그레이션보다 먼저 돈다:
 *   1) 공통코드 SYSTEM/DEMO_RESET_VERSION이 아래 RESET_VERSION과 다르면 public 스키마의 테이블·타입을 전부 지운다
 *      (마이그레이션 기록 포함 — 기준 데이터를 넣는 마이그레이션까지 처음부터 다시 돌게)
 *   2) 이어서 prisma migrate deploy → 서버 기동(권한·관리자) → seed-demo-once.ts(데모 데이터)
 *   seed-demo-once.ts가 시작할 때 DEMO_RESET_VERSION을 남겨 다음 재시작에는 지우지 않는다.
 * 테이블이 하나도 없는 새 DB면 지울 것이 없으므로 건너뛴다.
 * 실제 운영(실고객)으로 쓸 때는 환경변수 DEMO_SEED=off 로 끈다 — 그러면 절대 지우지 않는다.
 */
import { PrismaClient } from '@prisma/client';

import { RESET_VERSION } from './demo-versions';

async function main() {
  if ((process.env.DEMO_SEED ?? '').toLowerCase() === 'off') {
    console.log('[demo-reset] DEMO_SEED=off — 건너뜀');
    return;
  }
  const prisma = new PrismaClient();
  try {
    const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('public.common_code') IS NOT NULL AS exists`;
    if (!exists) {
      console.log('[demo-reset] 새 DB — 지울 것이 없음');
      return;
    }
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM common_code WHERE code_group = 'SYSTEM' AND code = 'DEMO_RESET_VERSION'`;
    if (rows[0]?.name === RESET_VERSION) {
      console.log(`[demo-reset] 이미 ${RESET_VERSION} — 건너뜀`);
      return;
    }
    console.log(
      `[demo-reset] ${rows[0]?.name ?? '없음'} → ${RESET_VERSION}: DB를 처음부터 다시 만든다`,
    );
    // 테이블(마이그레이션 기록 포함)과 enum 타입을 모두 지운다. 스키마는 남긴다(권한 문제 없이)
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
        END LOOP;
        FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
          EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
        END LOOP;
      END $$;`);
    console.log('[demo-reset] 지움 — 이어서 마이그레이션·시드가 처음부터 돈다');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // 리셋이 실패해도 서버는 뜨게 한다(데이터는 그대로)
  console.error('[demo-reset] 실패:', e);
});
