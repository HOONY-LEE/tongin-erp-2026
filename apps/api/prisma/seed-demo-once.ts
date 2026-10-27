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
import { ROLE_FRANCHISE } from '@tongin/shared';
import { RESET_VERSION } from './demo-versions';

const VERSION = '2026-10-27.1';
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

/**
 * 나중에 더한 시드 — 버전을 올려 전체를 다시 돌리지 않고(시연 중 바꾼 데이터 보존) 각각 한 번만 돌린다.
 * 끝나면 SYSTEM/DEMO_ADDON:<파일 이름>을 남긴다. 새로 더할 때는 여기에 한 줄만 추가한다.
 */
const ADDONS = ['seed-demo-dashboards.ts'];

/** 서버 부팅 시더가 역할(가맹점 등)을 만들 때까지 기다린다 — 시드가 역할에 계정을 붙인다 */
async function waitForRoles(prisma: PrismaClient) {
  for (let i = 0; i < 90; i++) {
    if (await prisma.role.findUnique({ where: { code: ROLE_FRANCHISE } })) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  if ((process.env.DEMO_SEED ?? '').toLowerCase() === 'off') {
    console.log('[demo-seed] DEMO_SEED=off — 건너뜀');
    return;
  }
  const prisma = new PrismaClient();
  try {
    if (!(await waitForRoles(prisma))) {
      console.error('[demo-seed] 3분이 지나도 기본 역할이 없다 — 다음 시작 때 다시 시도');
      return;
    }
    // 리셋(reset-demo-once.ts)이 끝났음을 남긴다 — 다음 재시작 때 다시 지우지 않게
    await prisma.commonCode.upsert({
      where: { codeGroup_code: { codeGroup: 'SYSTEM', code: 'DEMO_RESET_VERSION' } },
      update: { name: RESET_VERSION },
      create: {
        codeGroup: 'SYSTEM',
        code: 'DEMO_RESET_VERSION',
        name: RESET_VERSION,
        isActive: false,
      },
    });
    const where = { codeGroup_code: { codeGroup: 'SYSTEM', code: 'DEMO_SEED_VERSION' } };
    const cur = await prisma.commonCode.findUnique({ where });
    if (cur?.name === VERSION) {
      console.log(`[demo-seed] 이미 ${VERSION} — 건너뜀`);
      await runAddons(prisma);
      return;
    }
    // 재시작(배포)으로 끊겨도 끝난 단계는 건너뛴다 — SYSTEM/DEMO_SEED_STEP = '<버전>:<끝난 단계 수>'
    const stepWhere = { codeGroup_code: { codeGroup: 'SYSTEM', code: 'DEMO_SEED_STEP' } };
    const step = await prisma.commonCode.findUnique({ where: stepWhere });
    const [stepVer, stepDone] = (step?.name ?? '').split(':');
    const start = stepVer === VERSION ? Number(stepDone) || 0 : 0;
    console.log(
      `[demo-seed] ${cur?.name ?? '없음'} → ${VERSION} 데모 데이터 넣기 ${start ? `이어서(${start + 1}단계부터)` : '시작'}`,
    );
    for (const [i, s] of SCRIPTS.entries()) {
      if (i < start) continue;
      const t = Date.now();
      const r = spawnSync('npx', ['tsx', `prisma/${s}`], { stdio: 'inherit', env: process.env });
      if (r.status !== 0) {
        // 버전을 남기지 않으므로 다음 시작 때 다시 시도한다(시드는 여러 번 돌려도 안전하다)
        console.error(`[demo-seed] ${s} 실패(코드 ${r.status}) — 중단, 다음 시작 때 다시 시도`);
        return;
      }
      console.log(`[demo-seed] ${s} 완료 (${Math.round((Date.now() - t) / 1000)}초)`);
      await prisma.commonCode.upsert({
        where: stepWhere,
        update: { name: `${VERSION}:${i + 1}` },
        create: {
          codeGroup: 'SYSTEM',
          code: 'DEMO_SEED_STEP',
          name: `${VERSION}:${i + 1}`,
          isActive: false,
        },
      });
    }
    await prisma.commonCode.upsert({
      where,
      update: { name: VERSION },
      create: { codeGroup: 'SYSTEM', code: 'DEMO_SEED_VERSION', name: VERSION, isActive: false },
    });
    console.log(`[demo-seed] 완료 — 버전 ${VERSION} 기록`);
    await runAddons(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function runAddons(prisma: PrismaClient) {
  for (const s of ADDONS) {
    const where = { codeGroup_code: { codeGroup: 'SYSTEM', code: `DEMO_ADDON:${s}` } };
    if (await prisma.commonCode.findUnique({ where })) continue;
    const r = spawnSync('npx', ['tsx', `prisma/${s}`], { stdio: 'inherit', env: process.env });
    if (r.status !== 0) {
      console.error(`[demo-seed] ${s} 실패(코드 ${r.status}) — 다음 시작 때 다시 시도`);
      continue;
    }
    await prisma.commonCode.create({
      data: { codeGroup: 'SYSTEM', code: `DEMO_ADDON:${s}`, name: 'done', isActive: false },
    });
    console.log(`[demo-seed] 추가 시드 ${s} 완료`);
  }
}

main().catch((e) => {
  console.error('[demo-seed] 오류', e);
  process.exit(0); // 시드 실패로 서버가 죽지 않게
});
