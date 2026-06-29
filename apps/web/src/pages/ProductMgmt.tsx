import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import Products from './Products';
import CbmItems from './CbmItems';
import Addons from './Addons';

type Tab = 'product' | 'cbm' | 'addon';

/** 상품관리 — 상품 / 품목 / 옵션 탭 (카탈로그 분리: 상품·CBM사전·부가서비스). */
export default function ProductMgmt() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('product');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'product', label: t('nav.products') },
    { key: 'cbm', label: t('nav.cbmItems') },
    { key: 'addon', label: '옵션' },
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
      {tab === 'product' ? <Products /> : tab === 'cbm' ? <CbmItems /> : <Addons />}
    </div>
  );
}
