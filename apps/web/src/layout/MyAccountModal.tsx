import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, PasswordInput, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDirectory } from '../lib/approvals';
import styles from './profileMenu.module.css';

/** 내 계정 — 내 정보 보기 + 비밀번호 바꾸기(프로필 메뉴의 창) */
export function MyAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('settings.s.account')}
      size="sm"
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('settings.close')}
        </Button>
      }
    >
      {open && <AccountSettings onDone={onClose} />}
    </Modal>
  );
}

/** 내 정보 + 비밀번호 바꾸기 — 내 계정 창과 설정 창이 같이 쓴다 */
export function AccountSettings({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { people } = useDirectory();
  const me = people.find((p) => p.id === user?.employeeId);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCur('');
    setNext('');
    setAgain('');
  };

  const mismatch = !!again && next !== again;
  const tooShort = !!next && next.length < 6;
  const ready = !!cur && next.length >= 6 && next === again;

  const save = async () => {
    setSaving(true);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      toast({ type: 'success', title: t('settings.acct.saved') });
      reset();
      onDone?.();
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('settings.acct.failed'),
      });
    } finally {
      setSaving(false);
    }
  };

  const rows: [string, string | null | undefined][] = [
    [t('settings.acct.name'), user?.employeeName ?? user?.loginId],
    [t('settings.acct.loginId'), user?.loginId],
    [t('settings.acct.orgUnit'), me?.orgUnitName],
    [t('settings.acct.position'), user?.positionName ?? me?.positionName],
  ];

  return (
    <>
      <dl className={styles.info}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || '-'}</dd>
          </div>
        ))}
      </dl>
      <h4 className={styles.formTitle}>{t('settings.acct.pwTitle')}</h4>
      <div className={styles.form}>
        <label>
          {t('settings.acct.current')} <span className={styles.req}>*</span>
          <PasswordInput
            value={cur}
            autoComplete="current-password"
            onChange={(e) => setCur(e.target.value)}
          />
        </label>
        <label>
          {t('settings.acct.new')} <span className={styles.req}>*</span>
          <PasswordInput
            value={next}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
          {tooShort && <span className={styles.err}>{t('settings.acct.tooShort')}</span>}
        </label>
        <label>
          {t('settings.acct.again')} <span className={styles.req}>*</span>
          <PasswordInput
            value={again}
            autoComplete="new-password"
            onChange={(e) => setAgain(e.target.value)}
          />
          {mismatch && <span className={styles.err}>{t('settings.acct.mismatch')}</span>}
        </label>
      </div>
      <div className={styles.formActions}>
        <Button variant="primary" loading={saving} disabled={!ready} onClick={() => void save()}>
          {t('settings.acct.pwTitle')}
        </Button>
      </div>
    </>
  );
}
