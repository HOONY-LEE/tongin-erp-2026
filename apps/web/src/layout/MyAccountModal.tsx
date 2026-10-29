import { useState } from 'react';
import { Button, Modal, PasswordInput, useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDirectory } from '../lib/approvals';
import styles from './profileMenu.module.css';

/** 내 계정 — 내 정보 보기 + 비밀번호 바꾸기 */
export function MyAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
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
  const close = () => {
    reset();
    onClose();
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
      toast({ type: 'success', title: '비밀번호를 바꿨습니다' });
      close();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '바꾸지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const rows: [string, string | null | undefined][] = [
    ['이름', user?.employeeName ?? user?.loginId],
    ['아이디', user?.loginId],
    ['소속', me?.orgUnitName],
    ['직책', user?.positionName ?? me?.positionName],
  ];

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title="내 계정"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            닫기
          </Button>
          <Button variant="primary" loading={saving} disabled={!ready} onClick={() => void save()}>
            비밀번호 바꾸기
          </Button>
        </>
      }
    >
      <dl className={styles.info}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || '-'}</dd>
          </div>
        ))}
      </dl>
      <h4 className={styles.formTitle}>비밀번호 바꾸기</h4>
      <div className={styles.form}>
        <label>
          지금 비밀번호 <span className={styles.req}>*</span>
          <PasswordInput
            value={cur}
            autoComplete="current-password"
            onChange={(e) => setCur(e.target.value)}
          />
        </label>
        <label>
          새 비밀번호 <span className={styles.req}>*</span>
          <PasswordInput
            value={next}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
          {tooShort && <span className={styles.err}>6자 이상으로 정해 주세요.</span>}
        </label>
        <label>
          새 비밀번호 확인 <span className={styles.req}>*</span>
          <PasswordInput
            value={again}
            autoComplete="new-password"
            onChange={(e) => setAgain(e.target.value)}
          />
          {mismatch && <span className={styles.err}>새 비밀번호와 다릅니다.</span>}
        </label>
      </div>
    </Modal>
  );
}
