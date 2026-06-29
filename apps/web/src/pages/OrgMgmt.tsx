import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import OrgUnits from './OrgUnits';
import Placeholder from './Placeholder';

/** 조직관리 — 조직 / 직원 탭 (직원 화면은 순차 구현). */
export default function OrgMgmt() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'org' | 'emp'>('org');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant={tab === 'org' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setTab('org')}
        >
          {t('nav.orgUnits')}
        </Button>
        <Button
          variant={tab === 'emp' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setTab('emp')}
        >
          {t('nav.employees')}
        </Button>
      </div>
      {tab === 'org' ? <OrgUnits /> : <Placeholder titleKey="nav.employees" />}
    </div>
  );
}
