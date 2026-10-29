/**
 * 대시보드 템플릿 맨 위에 '결재할 문서'·'내 알림' 줄을 넣는다(관리자 공용 템플릿만, 한 번만 도는 추가 시드).
 *
 *   pnpm --filter @tongin/api demo:seed:dashboard-inbox
 *
 * - 이미 두 위젯 중 하나라도 있는 템플릿은 건드리지 않는다(관리자가 뺐거나 옮겼으면 그대로).
 * - 기존 위젯은 줄 높이만큼 아래로 내린다. 개인 대시보드는 손대지 않는다.
 */
import { PrismaClient } from '@prisma/client';
import { DASH_WIDGET_MAP, makeDashItem, type DashItem } from '@tongin/shared';

const prisma = new PrismaClient();
const TOP = ['approval.pending', 'inbox.recent'];
const H = 4;

async function main() {
  const templates = await prisma.dashboard.findMany({ where: { ownerUserId: null } });
  for (const d of templates) {
    const cur = d.layout as { version: 1; items: DashItem[] } | null;
    const items = cur?.items ?? [];
    if (items.some((i) => TOP.includes(i.widget))) {
      console.log(`대시보드 '${d.name}' — 결재·알림 위젯 있음(건너뜀)`);
      continue;
    }
    const top = TOP.map((key, i) => {
      const it = makeDashItem(DASH_WIDGET_MAP.get(key)!);
      it.viz = 'list';
      it.w = 6;
      it.h = H;
      it.x = i * 6;
      it.y = 0;
      return it;
    });
    await prisma.dashboard.update({
      where: { id: d.id },
      data: {
        layout: {
          version: 1,
          items: [...top, ...items.map((i) => ({ ...i, y: i.y + H }))],
        } as object,
      },
    });
    console.log(`대시보드 '${d.name}' — 맨 위에 결재할 문서·내 알림 넣음`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
