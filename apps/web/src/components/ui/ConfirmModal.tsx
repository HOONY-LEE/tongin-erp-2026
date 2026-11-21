import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Button, Modal } from '@sunghoon_lee/akron-ui';
import styles from './ConfirmModal.module.css';

/**
 * 한 번 더 확인하는 창 — 브라우저 알림(confirm) 대신. 모든 확인 창이 같은 모양:
 * title = 짧은 동작 이름(예: 상담 완료), message = 묻는 말 한 줄(크게), children = 입력칸 등(있을 때만).
 * 설명용 작은 글씨는 넣지 않는다.
 */
export function ConfirmModal({
  open,
  title,
  message,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  /** 묻는 말 — 크게 한 줄 */
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('ui.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel ?? t('ui.confirm')}
          </Button>
        </>
      }
    >
      {message && <p className={styles.message}>{message}</p>}
      {children && <div className={message ? styles.extra : undefined}>{children}</div>}
    </Modal>
  );
}
