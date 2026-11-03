import { SquareArrowOutUpRight } from 'lucide-react';
import { canPopout, openPopout } from '../../lib/popout';
import { useToast } from '@sunghoon_lee/akron-ui';
import styles from './PopoutButton.module.css';

/** 작업 화면 오른쪽 위의 작은 '새 창으로 열기' 버튼. 새 창 안에서는 보이지 않는다 */
export function PopoutButton({ floating, className }: { floating?: boolean; className?: string }) {
  const toast = useToast();
  if (!canPopout()) return null;
  return (
    <button
      type="button"
      className={[styles.btn, floating ? styles.floating : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      title="새 창으로 열기"
      aria-label="새 창으로 열기"
      onClick={() => {
        if (!openPopout())
          toast({ type: 'error', title: '브라우저가 새 창을 막았습니다. 팝업을 허용해 주세요.' });
      }}
    >
      <SquareArrowOutUpRight size={14} />
    </button>
  );
}
