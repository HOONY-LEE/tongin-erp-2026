import { useState } from 'react';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import Partners from './Partners';
import PriceConditions from './PriceConditions';

type Tab = 'partner' | 'price';

/** 거래처 관리 — 거래처 목록 + 가격조건 탭. */
export default function PartnerMgmt() {
  const [tab, setTab] = useState<Tab>('partner');
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();
  const tabs: { key: Tab; label: string }[] = [
    { key: 'partner', label: '거래처' },
    { key: 'price', label: '가격 조건' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="거래처 관리"
        onRefresh={() => {
          setRefreshKey((k) => k + 1);
          touch();
        }}
        updatedAt={updatedAt}
        footer={
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={tabs.map((tb) => ({ value: tb.key, label: tb.label }))}
          />
        }
      />
      {tab === 'partner' ? (
        <Partners key={`partner-${refreshKey}`} />
      ) : (
        <PriceConditions key={`price-${refreshKey}`} />
      )}
    </div>
  );
}
