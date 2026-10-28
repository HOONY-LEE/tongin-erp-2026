import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useTabParam } from '../lib/useDetailParam';
import OrgUnits from './OrgUnits';
import Employees from './Employees';

type Tab = 'org' | 'emp';

/** 조직관리 — 조직 / 직원 탭 (직원 화면은 순차 구현). */
export default function OrgMgmt() {
  const { t } = useTranslation();
  const { tab, setTab, inDetail } = useTabParam<Tab>('org');
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!inDetail && (
        <PageHeader
          title={t('nav.orgMgmt')}
          onRefresh={() => {
            setRefreshKey((k) => k + 1);
            touch();
          }}
          updatedAt={updatedAt}
          footer={
            <SegmentedControl
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={[
                { value: 'org', label: t('nav.orgUnits') },
                { value: 'emp', label: t('nav.employees') },
              ]}
            />
          }
        />
      )}
      {tab === 'org' ? (
        <OrgUnits key={`org-${refreshKey}`} />
      ) : (
        <Employees key={`emp-${refreshKey}`} />
      )}
    </div>
  );
}
