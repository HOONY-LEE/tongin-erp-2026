/**
 * 운영(시연) 서버 시작 때 데모 데이터를 '버전마다 한 번'만 넣는다.
 *
 * 무료 Render에는 셸이 없어 운영 DB에 시드를 직접 돌릴 수 없다. 그래서 컨테이너가 뜰 때 이 스크립트가
 * 공통코드 SYSTEM/DEMO_SEED_VERSION을 보고, 아래 VERSION과 다를 때만 demo:seed:all 순서대로 돌린 뒤 버전을 남긴다.
 * → 재시작(무료 플랜은 자주 잠들고 깬다)마다 시연 중 바꾼 데이터가 되돌아가지 않는다.
 * 시드를 새로 바꿔 운영에 다시 넣고 싶으면 VERSION만 올린다.
 * 실제 운영(실고객)으로 쓸 때는 환경변수 DEMO_SEED=off 로 끈다.
 */
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const VERSION = '2026-10-23.1';
const SCRIPTS = [
  'seed-demo.ts',
  'seed-demo-cases.ts',
  'seed-demo-ops.ts',
  'seed-demo-regions.ts',
  'seed-demo-calendar.ts',
  'seed-demo-campaigns.ts',
  'seed-demo-anomaly.ts',
  'seed-demo-agents.ts',
];

async function main() {
  if ((process.env.DEMO_SEED ?? '').toLowerCase() === 'off') {
    console.log('[demo-seed] DEMO_SEED=off — 건너뜀');
    return;
  }
  const prisma = new PrismaClient();
  try {
    const where = { codeGroup_code: { codeGroup: 'SYSTEM', code: 'DEMO_SEED_VERSION' } };
    const cur = await prisma.commonCode.findUnique({ where });
    if (cur?.name === VERSION) {
      console.log(`[demo-seed] 이미 ${VERSION} — 건너뜀`);
      return;
    }
    console.log(`[demo-seed] ${cur?.name ?? '없음'} → ${VERSION} 데모 데이터 넣기 시작`);
    for (const s of SCRIPTS) {
      const t = Date.now();
      const r = spawnSync('npx', ['tsx', `prisma/${s}`], { stdio: 'inherit', env: process.env });
      if (r.status !== 0) {
        // 버전을 남기지 않으므로 다음 시작 때 다시 시도한다(시드는 여러 번 돌려도 안전하다)
        console.error(`[demo-seed] ${s} 실패(코드 ${r.status}) — 중단, 다음 시작 때 다시 시도`);
        return;
      }
      console.log(`[demo-seed] ${s} 완료 (${Math.round((Date.now() - t) / 1000)}초)`);
    }
    await prisma.commonCode.upsert({
      where,
      update: { name: VERSION },
      create: { codeGroup: 'SYSTEM', code: 'DEMO_SEED_VERSION', name: VERSION, isActive: false },
    });
    console.log(`[demo-seed] 완료 — 버전 ${VERSION} 기록`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[demo-seed] 오류', e);
  process.exit(0); // 시드 실패로 서버가 죽지 않게
});
