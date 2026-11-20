import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button, Modal, PasswordInput, useToast } from '../ui';
import { api, ApiError } from '../../lib/api';
import { APPLE } from '../../lib/palette';
import styles from './account.module.css';

/** 새 비밀번호 규칙 — 서버(ChangePasswordDto)와 같다: 8자 이상 + 영문 + 숫자 */
const RULES = [
  { label: '8자 이상', ok: (v: string) => v.length >= 8 },
  { label: '영문 포함', ok: (v: string) => /[A-Za-z]/.test(v) },
  { label: '숫자 포함', ok: (v: string) => /[0-9]/.test(v) },
  { label: '특수문자 포함(권장)', ok: (v: string) => /[^A-Za-z0-9]/.test(v), optional: true },
];

/** 비밀번호 세기 — 0 없음 · 1 위험 · 2 보통 · 3 안전 */
export function passwordStrength(v: string): 0 | 1 | 2 | 3 {
  if (!v) return 0;
  const required = RULES.filter((r) => !r.optional).every((r) => r.ok(v));
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
  { label: '위험', color: APPLE.red },
  { label: '보통', color: APPLE.orange },
  { label: '안전', color: APPLE.green },
] as const;

/**
 * 비밀번호 바꾸기 — 1단계: 지금 비밀번호 확인 → 2단계: 새 비밀번호(규칙·세기 막대·확인 일치).
 * 새 비밀번호는 규칙을 다 맞추고(가능) 확인이 같아야 바꿀 수 있다.
 */
export function PasswordChangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
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
  const rulesOk = RULES.filter((r) => !r.optional).every((r) => r.ok(next));
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
      setError(e instanceof ApiError ? e.message : '확인하지 못했습니다');
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
      toast({ type: 'success', title: '비밀번호를 바꿨습니다' });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '바꾸지 못했습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="비밀번호 변경"
      description={step === 1 ? '먼저 지금 비밀번호를 확인합니다.' : '새 비밀번호를 정해 주세요.'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={step === 2 ? () => setStep(1) : onClose}>
            {step === 2 ? '이전' : '취소'}
          </Button>
          {step === 1 ? (
            <Button variant="primary" disabled={!cur || busy} onClick={() => void verify()}>
              다음
            </Button>
          ) : (
            <Button variant="primary" disabled={!ready || busy} onClick={() => void save()}>
              {busy ? '바꾸는 중…' : '비밀번호 변경'}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.steps} aria-hidden>
        <span className={styles.stepOn}>1 지금 비밀번호</span>
        <span className={step === 2 ? styles.stepOn : undefined}>2 새 비밀번호</span>
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
            <span>지금 비밀번호</span>
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
            <span>새 비밀번호</span>
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
            <b style={{ color: s?.color }}>{s ? s.label : ' '}</b>
          </div>
          <ul className={styles.rules}>
            {RULES.map((r) => {
              const ok = r.ok(next);
              return (
                <li key={r.label} className={ok ? styles.ruleOk : undefined}>
                  {ok ? <Check size={13} /> : <X size={13} />}
                  {r.label}
                </li>
              );
            })}
            {next && next === cur && (
              <li>
                <X size={13} />
                지금 비밀번호와 달라야 합니다
              </li>
            )}
          </ul>
          <label className={styles.field}>
            <span>새 비밀번호 확인</span>
            <PasswordInput
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {again && (
            <p className={match ? styles.matchOk : styles.matchNo}>
              {match ? <Check size={13} /> : <X size={13} />}
              {match ? '비밀번호가 같습니다' : '비밀번호가 다릅니다'}
            </p>
          )}
        </form>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </Modal>
  );
}
