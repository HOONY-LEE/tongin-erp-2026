import type { ReactNode } from 'react';
import { Card } from '@sunghoon_lee/akron-ui';

interface Props {
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  /** true면 카드 테두리/배경 없이 제목행+본문만 렌더 — 본문(DataTable 등)이 자체 테두리를 갖고 있어
   *  카드 테두리까지 두르면 이중 테두리가 되는 경우에 사용. */
  plain?: boolean;
}

/** 목록/상세 화면의 공통 카드 컨테이너 (제목 + 건수 + 우측 액션 + 본문). */
export function PageCard({ title, count, actions, children, plain = false }: Props) {
  const header = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}
    >
      <h3 style={{ margin: 0 }}>
        {title}
        {count !== undefined && (
          <span style={{ color: 'var(--ark-color-text-tertiary)', fontWeight: 400 }}>
            {' '}
            ({count})
          </span>
        )}
      </h3>
      {actions}
    </div>
  );

  if (plain) {
    return (
      <div>
        {header}
        {children}
      </div>
    );
  }

  return (
    <Card style={{ padding: 20 }}>
      {header}
      {children}
    </Card>
  );
}
