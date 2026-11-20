import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, PasswordInput, useToast } from '../ui';
import { api, ApiError } from '../../lib/api';
import { APPLE } from '../../lib/palette';
import styles from './account.module.css';

/** 새 비밀번호 규칙 — 서버(ChangePasswordDto)와 같다: 8자 이상 + 영문 + 숫자 */
const RULES = [
  { key: 'len', ok: (v: string) => v.length >= 8 },
  { key: 'alpha', ok: (v: string) => /[A-Za-z]/.test(v) },
  { key: 'digit', ok: (v: string) => /[0-9]/.test(v) },
  { key: 'special', ok: (v: string) => /[^A-Za-z0-9]/.test(v), optional: true },
] as const;

/** 비밀번호 세기 — 0 없음 · 1 위험 · 2 보통 · 3 안전 */
export function passwordStrength(v: string): 0 | 1 | 2 | 3 {
  if (!v) return 0;
  const required = RULES.filter((r) => !('optional' in r)).every((r) => r.ok(v));
  if (!required) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(v)).length;
  // 같은 글자 반복·연속 숫자만 잔뜩이면 한 단계 낮춘다
  const weak = /(.)\1{2,}/.test(v) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(v);
  const score =
    (v.length >= 12 ? 2 : v.length >= 10 ? 1 : 0) + (classes >= 3 ? 1 : 0) - (weak ? 1 : 0);
  return score >= 2 ? 3 : 2;
}
const STRENGTH = [
  null,
  { key: 'weak', color: APPLE.red },
  { key: 'fair', color: APPLE.orange },
  { key: 'strong', color: APPLE.green },
] as const;

/**
 * 비밀번호 바꾸기 — 1단계: 지금 비밀번호 확인 → 2단계: 새 비밀번호(규칙·세기 막대·확인 일치).
 * 새 비밀번호는 규칙을 다 맞추고(가능) 확인이 같아야 바꿀 수 있다.
 */
export function PasswordChangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setCur('');
    setNext('');
    setAgain('');
    setError(null);
  }, [open]);

  const strength = passwordStrength(next);
  const s = STRENGTH[strength];
  const rulesOk = RULES.filter((r) => !('optional' in r)).every((r) => r.ok(next));
  const match = !!again && next === again;
  const ready = rulesOk && match && next !== cur;

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password/verify', {
        method: 'POST',
        body: JSON.stringify({ password: cur }),
      });
      setStep(2);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('account.pw.verifyFailed'));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      toast({ type: 'success', title: t('account.pw.saved') });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('account.pw.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('account.pw.title')}
      description={step === 1 ? t('account.pw.descVerify') : t('account.pw.descNew')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={step === 2 ? () => setStep(1) : onClose}>
            {step === 2 ? t('account.pw.prev') : t('account.pw.cancel')}
          </Button>
          {step === 1 ? (
            <Button variant="primary" disabled={!cur || busy} onClick={() => void verify()}>
              {t('account.pw.next')}
            </Button>
          ) : (
            <Button variant="primary" disabled={!ready || busy} onClick={() => void save()}>
              {busy ? t('account.pw.saving') : t('account.pw.title')}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.steps} aria-hidden>
        <span className={styles.stepOn}>{t('account.pw.stepCurrent')}</span>
        <span className={step === 2 ? styles.stepOn : undefined}>{t('account.pw.stepNew')}</span>
      </div>
      {step === 1 ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (cur) void verify();
          }}
        >
          <label className={styles.field}>
            <span>{t('account.pw.current')}</span>
            <PasswordInput
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
        </form>
      ) : (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void save();
          }}
        >
          <label className={styles.field}>
            <span>{t('account.pw.new')}</span>
            <PasswordInput
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          {/* 세기 막대 — 위험(빨강) · 보통(주황) · 안전(초록) */}
          <div className={styles.meter} aria-live="polite">
            <div className={styles.bars}>
              {[1, 2, 3].map((i) => (
                <span key={i} style={{ background: s && strength >= i ? s.color : undefined }} />
              ))}
            </div>
            <b style={{ color: s?.color }}>{s ? t(`account.pw.strength.${s.key}`) : ' '}</b>
          </div>
          <ul className={styles.rules}>
            {RULES.map((r) => {
              const ok = r.ok(next);
              return (
                <li key={r.key} className={ok ? styles.ruleOk : undefined}>
                  {ok ? <Check size={13} /> : <X size={13} />}
                  {t(`account.pw.rule.${r.key}`)}
                </li>
              );
            })}
            {next && next === cur && (
              <li>
                <X size={13} />
                {t('account.pw.mustDiffer')}
              </li>
            )}
          </ul>
          <label className={styles.field}>
            <span>{t('account.pw.again')}</span>
            <PasswordInput
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {again && (
            <p className={match ? styles.matchOk : styles.matchNo}>
              {match ? <Check size={13} /> : <X size={13} />}
              {match ? t('account.pw.match') : t('account.pw.mismatch')}
            </p>
          )}
        </form>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </Modal>
  );
}
