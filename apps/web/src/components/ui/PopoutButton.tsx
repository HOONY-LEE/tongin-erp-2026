import { useTranslation } from 'react-i18next';
import { SquareArrowOutUpRight } from 'lucide-react';
import { canPopout, openPopout } from '../../lib/popout';
import { useToast } from '@sunghoon_lee/akron-ui';
import styles from './PopoutButton.module.css';

/** 작업 화면 오른쪽 위의 작은 '새 창으로 열기' 버튼. 새 창 안에서는 보이지 않는다 */
export function PopoutButton({ floating, className }: { floating?: boolean; className?: string }) {
  const toast = useToast();
  const { t } = useTranslation();
  if (!canPopout()) return null;
  return (
    <button
      type="button"
      className={[styles.btn, floating ? styles.floating : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      title={t('ui.popout')}
      aria-label={t('ui.popout')}
      onClick={() => {
        if (!openPopout()) toast({ type: 'error', title: t('ui.popupBlocked') });
      }}
    >
      <SquareArrowOutUpRight size={14} />
    </button>
  );
}
