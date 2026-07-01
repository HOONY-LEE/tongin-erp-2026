import { useState } from 'react';
import { Button } from '../components/ui';
import Partners from './Partners';
import PriceConditions from './PriceConditions';

type Tab = 'partner' | 'price';

/** 거래처 관리 — 거래처 목록 + 가격조건 탭. */
export default function PartnerMgmt() {
  const [tab, setTab] = useState<Tab>('partner');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'partner', label: '거래처' },
    { key: 'price', label: '가격 조건' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {tabs.map((tb) => (
          <Button
            key={tb.key}
            variant={tab === tb.key ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </Button>
        ))}
      </div>
      {tab === 'partner' ? <Partners /> : <PriceConditions />}
    </div>
  );
}
