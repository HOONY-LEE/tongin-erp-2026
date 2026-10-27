import { DASH_ROW_HEIGHT, type DashLayout } from '@tongin/shared';
import { useDashData } from './useDashData';
import { WidgetFrame } from './WidgetFrame';
import styles from './builder.module.css';

/** 보기 화면 — 12칸 격자에 위젯을 놓인 대로(좁은 화면에서는 한 줄씩 위에서부터) */
export function DashboardView({ layout, refreshKey }: { layout: DashLayout; refreshKey: number }) {
  const { results, loading } = useDashData(layout.items, refreshKey);
  const items = [...layout.items].sort((a, b) => a.y - b.y || a.x - b.x);
  if (!items.length) {
    return (
      <div className={styles.emptyBoard}>
        아직 위젯이 없습니다. '편집'을 눌러 위젯을 놓아 보세요.
      </div>
    );
  }
  return (
    <div className={styles.viewGrid} style={{ gridAutoRows: DASH_ROW_HEIGHT }}>
      {items.map((it) => (
        <div
          key={it.id}
          className={styles.cell}
          style={{
            gridColumn: `${it.x + 1} / span ${it.w}`,
            gridRow: `${it.y + 1} / span ${it.h}`,
            ['--h' as string]: it.h,
          }}
        >
          <WidgetFrame item={it} result={results[it.id]} loading={loading.has(it.id)} />
        </div>
      ))}
    </div>
  );
}
