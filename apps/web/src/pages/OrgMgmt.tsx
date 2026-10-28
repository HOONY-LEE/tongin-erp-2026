import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { List, Network } from 'lucide-react';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useTabParam } from '../lib/useDetailParam';
import OrgUnits from './OrgUnits';
import Employees from './Employees';
import styles from './orgMgmt.module.css';

type Tab = 'org' | 'emp';
type View = 'list' | 'chart';

/**
 * 조직관리 — 본사 조직 / 본사 직원 탭. 지점과 지점 직원은 지점관리에서 다룬다.
 * 탭·보기 방식(목록/조직도)은 주소(?tab=, ?view=)에 둬서 상세에서 돌아와도 그대로다.
 */
export default function OrgMgmt() {
  const { t } = useTranslation();
  const { tab, setTab, inDetail } = useTabParam<Tab>('org');
  const { tab: view, setTab: setView } = useTabParam<View>('list', 'view');
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
            // 한 줄: 왼쪽 끝 [조직 | 직원] 탭, 오른쪽 끝 [목록 | 조직도] 보기 전환
            <div className={styles.bar}>
              <SegmentedControl
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                options={[
                  { value: 'org', label: t('nav.orgUnits') },
                  { value: 'emp', label: t('nav.employees') },
                ]}
              />
              <SegmentedControl
                value={view}
                onChange={(v) => setView(v as View)}
                aria-label="보기 방식"
                options={[
                  {
                    value: 'list',
                    label: (
                      <span className={styles.viewOpt}>
                        <List size={15} aria-hidden />
                        목록
                      </span>
                    ),
                  },
                  {
                    value: 'chart',
                    label: (
                      <span className={styles.viewOpt}>
                        <Network size={15} aria-hidden />
                        조직도
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          }
        />
      )}
      {tab === 'org' ? (
        <OrgUnits key={`org-${refreshKey}`} view={view} />
      ) : (
        <Employees key={`emp-${refreshKey}`} view={view} />
      )}
    </div>
  );
}
