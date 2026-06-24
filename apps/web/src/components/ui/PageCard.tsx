import type { ReactNode } from 'react';
import { Card } from '@sunghoon_lee/akron-ui';

interface Props {
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}

/** 목록/상세 화면의 공통 카드 컨테이너 (제목 + 건수 + 우측 액션 + 본문). */
export function PageCard({ title, count, actions, children }: Props) {
  return (
    <Card style={{ padding: 20 }}>
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
      {children}
    </Card>
  );
}
