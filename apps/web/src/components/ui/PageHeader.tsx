import { forwardRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  PageHeader as AkronPageHeader,
  type PageHeaderProps as AkronPageHeaderProps,
} from '@sunghoon_lee/akron-ui';

export interface PageHeaderProps extends AkronPageHeaderProps {
  /** 새로고침 버튼 클릭 시 호출. 지정 시 헤더 우측에 새로고침 아이콘이 노출됨 */
  onRefresh?: () => void | Promise<void>;
  /** 마지막 데이터 갱신 시각. 지정 시 새로고침 아이콘 옆에 작고 연하게 표시 */
  updatedAt?: Date | null;
}

function formatUpdatedAt(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} 업데이트`;
}

/**
 * akron-ui PageHeader는 자체 상하 padding(상 24px/하 20px, 좌우 0)을 갖고 있어
 * AppLayout의 균일한 24px 콘텐츠 패딩과 겹치면 상하 여백만 더 커 보인다.
 * 좌우 padding과 동일해지도록 자체 상하 padding을 0으로 상쇄한다.
 * 전 페이지 공통: 하단 구분선은 기본 제거, 새로고침 아이콘·마지막 업데이트 시각을 우측 끝에 표시.
 */
export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader(
  { style, divider = false, actions, onRefresh, updatedAt, ...props },
  ref,
) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const refreshSlot = onRefresh ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {actions}
      {updatedAt && (
        <span style={{ fontSize: 11, color: 'var(--ark-color-text-tertiary)' }}>
          {formatUpdatedAt(updatedAt)}
        </span>
      )}
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="새로고침"
        title="새로고침"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          border: '1px solid var(--ark-color-border)',
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--ark-color-text-secondary)',
          cursor: refreshing ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        <RefreshCw size={14} className={refreshing ? 'ark-spin' : undefined} />
      </button>
    </div>
  ) : (
    actions
  );

  return (
    <AkronPageHeader
      ref={ref}
      style={{ paddingTop: 0, paddingBottom: 0, ...style }}
      divider={divider}
      actions={refreshSlot}
      {...props}
    />
  );
});
