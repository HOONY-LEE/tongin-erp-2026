import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import { Skeleton } from './Skeleton';

export interface DetailItem {
  label: string;
  value: ReactNode;
  /** 한 줄 전체를 쓴다(주소·메모처럼 긴 값) */
  wide?: boolean;
}

export interface DetailSection {
  title?: string;
  items: DetailItem[];
}

const empty = (v: ReactNode) => v === null || v === undefined || v === '';

/**
 * 공통 상세 화면 — 목록 행을 누르면 열린다(useDetailParam).
 * 머리글(← 목록 · 제목 · 동작 버튼) + 항목 카드. 목록 행 끝에 두던 수정·삭제 같은 동작은 여기 actions로 온다.
 */
export function RecordDetail({
  title,
  backLabel,
  onBack,
  actions,
  sections,
  loading,
  children,
}: {
  title: string;
  /** 머리글 위 돌아가기 링크 글자(목록 이름) */
  backLabel: string;
  onBack: () => void;
  actions?: ReactNode;
  sections: DetailSection[];
  loading?: boolean;
  /** 항목 카드 아래에 더 둘 내용(관련 목록 등) */
  children?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={loading ? '불러오는 중…' : title}
        breadcrumbs={[{ label: backLabel, onClick: onBack }]}
        actions={actions}
      />
      {loading ? (
        <div className="rd-card">
          <Skeleton height={20} width="40%" />
          <Skeleton height={20} width="70%" />
          <Skeleton height={20} width="55%" />
        </div>
      ) : (
        sections.map((s, i) => (
          <section key={s.title ?? i} className="rd-card">
            {s.title && <h3 className="rd-title">{s.title}</h3>}
            <dl className="rd-grid">
              {s.items.map((it) => (
                <div key={it.label} className={`rd-item${it.wide ? ' rd-wide' : ''}`}>
                  <dt>{it.label}</dt>
                  <dd>{empty(it.value) ? <span className="rd-empty">-</span> : it.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
      {children}
    </div>
  );
}
