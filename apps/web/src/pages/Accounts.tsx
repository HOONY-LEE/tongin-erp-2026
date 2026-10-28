import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useTabParam } from '../lib/useDetailParam';
import AccountList from './access/AccountList';
import PermissionGroups from './access/PermissionGroups';
import Positions from './access/Positions';

type Tab = 'accounts' | 'groups' | 'positions';

/**
 * 계정·권한
 * - 계정: 누가 어떤 권한 그룹을 어느 데이터 범위로 갖는지
 * - 권한 그룹: 메뉴마다 조회·등록·수정·삭제·특수 권한 묶음
 * - 직책: 회장·대표·이사·부장… (표시·인사용, 권한과 별개)
 */
export default function Accounts() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();
  const tabs: { key: Tab; label: string }[] = [
    ...(can('USER.READ') ? [{ key: 'accounts' as const, label: '계정' }] : []),
    ...(can('ROLE.READ')
      ? [
          { key: 'groups' as const, label: '권한 그룹' },
          { key: 'positions' as const, label: '직책' },
        ]
      : []),
  ];
  const { tab, setTab, inDetail } = useTabParam<Tab>(tabs[0]?.key ?? 'accounts');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!inDetail && (
        <PageHeader
          title={t('nav.accounts')}
          onRefresh={() => {
            setRefreshKey((k) => k + 1);
            touch();
          }}
          updatedAt={updatedAt}
          footer={
            tabs.length > 1 ? (
              <SegmentedControl
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                options={tabs.map((tb) => ({ value: tb.key, label: tb.label }))}
              />
            ) : undefined
          }
        />
      )}
      {tab === 'accounts' ? (
        <AccountList key={`a-${refreshKey}`} />
      ) : tab === 'groups' ? (
        <PermissionGroups key={`g-${refreshKey}`} />
      ) : (
        <Positions key={`p-${refreshKey}`} />
      )}
    </div>
  );
}
