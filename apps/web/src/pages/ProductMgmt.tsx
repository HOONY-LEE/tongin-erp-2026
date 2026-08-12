import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import Products from './Products';
import CbmItems from './CbmItems';
import Addons from './Addons';

type Tab = 'product' | 'cbm' | 'addon';

/** 상품관리 — 상품 / 품목 / 옵션 탭 (카탈로그 분리: 상품·CBM사전·부가서비스). */
export default function ProductMgmt() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('product');
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();
  const tabs: { key: Tab; label: string }[] = [
    { key: 'product', label: t('nav.products') },
    { key: 'cbm', label: t('nav.cbmItems') },
    { key: 'addon', label: '옵션' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('nav.productMgmt')}
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
      {tab === 'product' ? (
        <Products key={`product-${refreshKey}`} />
      ) : tab === 'cbm' ? (
        <CbmItems key={`cbm-${refreshKey}`} />
      ) : (
        <Addons key={`addon-${refreshKey}`} />
      )}
    </div>
  );
}
