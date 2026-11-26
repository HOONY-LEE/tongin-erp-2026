/**
 * 시드(추가, 한 번만) — 이미 들어간 시연 에이전트 고치기.
 * '주간 실적 요약 보고'(…a9003)가 누적 통계(stats.overview)를 써서 주간이 아닌 전체 숫자를 보고하던 것을
 * 지난 7일 매출 통계(stats.sales)·지점 실적(기간)으로 바꾼다. 사람이 그래프를 고쳤으면(노드가 다르면) 건드리지 않는다.
 *
 *   pnpm --filter @tongin/api exec tsx prisma/seed-demo-agents-fix.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ID = '00000000-0000-4000-8000-0000000a9003';

interface Node {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

async function main() {
  const b = await prisma.agentBlueprint.findUnique({ where: { id: ID } });
  if (!b) return console.log('[demo-agents-fix] 주간 실적 요약 보고 없음 — 건너뜀');
  const g = b.graph as unknown as { nodes: Node[] };
  const stats = g.nodes.find((n) => n.id === 'stats');
  const branches = g.nodes.find((n) => n.id === 'branches');
  if (!stats || !branches || stats.config.tool !== 'erp_stats_overview')
    return console.log('[demo-agents-fix] 이미 고쳤거나 바뀐 그래프 — 건너뜀');
  stats.label = '지난주 매출 통계';
  stats.config = {
    ...stats.config,
    tool: 'erp_stats_sales',
    args: { from: '{{run.weekAgo}}', to: '{{run.today}}', groupBy: 'day' },
  };
  branches.label = '지난주 지점 실적';
  branches.config = { ...branches.config, args: { from: '{{run.weekAgo}}', to: '{{run.today}}' } };
  await prisma.agentBlueprint.update({
    where: { id: ID },
    data: { graph: g as unknown as object },
  });
  console.log('[demo-agents-fix] 주간 실적 요약 보고 — 지난 7일 기준으로 고침');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
