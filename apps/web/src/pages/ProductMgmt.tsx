import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import Products from './Products';
import CbmItems from './CbmItems';

/** 상품관리 — 상품 / 품목 탭 (메뉴명에는 미표기, 내부 분류). */
export default function ProductMgmt() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'product' | 'cbm'>('product');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant={tab === 'product' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setTab('product')}
        >
          {t('nav.products')}
        </Button>
        <Button
          variant={tab === 'cbm' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setTab('cbm')}
        >
          {t('nav.cbmItems')}
        </Button>
      </div>
      {tab === 'product' ? <Products /> : <CbmItems />}
    </div>
  );
}
