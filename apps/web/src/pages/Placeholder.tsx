import { useTranslation } from 'react-i18next';
import { PageCard, PageHeader } from '../components/ui';

/** 메뉴구조 먼저 — 아직 화면이 없는 메뉴의 자리표시(순차 구현 예정). */
export default function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={t(titleKey)} />
      <PageCard title="안내">
        <div
          style={{
            padding: '56px 0',
            textAlign: 'center',
            color: 'var(--ark-color-text-tertiary)',
            fontSize: 14,
          }}
        >
          화면 준비 중입니다 — 곧 제공될 예정입니다.
        </div>
      </PageCard>
    </div>
  );
}
