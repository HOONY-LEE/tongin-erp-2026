import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import Products from './Products';
import CbmItems from './CbmItems';
import Addons from './Addons';
import RoomTemplates from './RoomTemplates';
import HandlingMethods from './HandlingMethods';

type Tab = 'product' | 'addon' | 'cbm' | 'room' | 'handling';

/**
 * 상품관리
 * - 상품구성: 가정이사·기업이전처럼 견적서에 대표로 보이는 묶음. 어떤 상품이 필수·기본선택·선택인지 정한다
 * - 상품: 실제로 파는 것(이사물량·사다리차·입주청소 …)
 * - 이사물품 · 방 · 처리방법: 이사물량을 잡는 물품정보(2단계)의 재료
 */
export default function ProductMgmt() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('product');
  const [refreshKey, setRefreshKey] = useState(0);
  const { updatedAt, touch } = useUpdatedAt();
  const tabs: { key: Tab; label: string }[] = [
    { key: 'product', label: '상품구성' },
    { key: 'addon', label: '상품' },
    { key: 'cbm', label: '이사물품' },
    { key: 'room', label: '방' },
    { key: 'handling', label: '처리방법' },
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
      ) : tab === 'addon' ? (
        <Addons key={`addon-${refreshKey}`} />
      ) : tab === 'cbm' ? (
        <CbmItems key={`cbm-${refreshKey}`} />
      ) : tab === 'room' ? (
        <RoomTemplates key={`room-${refreshKey}`} />
      ) : (
        <HandlingMethods key={`handling-${refreshKey}`} />
      )}
    </div>
  );
}
