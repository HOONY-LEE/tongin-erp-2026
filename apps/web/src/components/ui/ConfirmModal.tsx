import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Button, Modal } from '@sunghoon_lee/akron-ui';

/** 한 번 더 확인하는 창 — 브라우저 알림(confirm) 대신 */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
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
      {children}
    </Modal>
  );
}
