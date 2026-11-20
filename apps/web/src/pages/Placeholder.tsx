import { useTranslation } from 'react-i18next';
import { tDyn } from '../i18n';
import { PageCard, PageHeader } from '../components/ui';
import { fs } from '../lib/fontScale';

/** 메뉴구조 먼저 — 아직 화면이 없는 메뉴의 자리표시(순차 구현 예정). */
export default function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={tDyn(titleKey)} />
      <PageCard title={t('ui.notice')}>
        <div
          style={{
            padding: '56px 0',
            textAlign: 'center',
            color: 'var(--ark-color-text-tertiary)',
            fontSize: fs(14),
          }}
        >
          {t('ui.comingSoon')}
        </div>
      </PageCard>
    </div>
  );
}
