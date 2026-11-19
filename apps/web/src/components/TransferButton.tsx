import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneForwarded, Settings2 } from 'lucide-react';
import { formatPhone } from '../lib/phone';
import { transferTo, useExtensions, type Extension } from '../lib/extensions';
import { useAuth } from '../auth/AuthContext';
import { Button, Input, useToast } from './ui';
import styles from './SoftphoneBar.module.css';

type Target = Pick<Extension, 'id' | 'label' | 'dept' | 'number'>;

/**
 * 통화 막대 [돌려주기] — 사무실 직원·부서로 지금 통화를 넘긴다.
 * 목록에서 고르거나 번호를 직접 넣고 [돌려주기]. 상대가 받으면 내 통화는 끊기고, 콜에 넘긴 곳이 남는다.
 * 목록은 '내선 관리' 화면에서 고친다(상담 관리자).
 */
export function TransferButton({ customerPhone }: { customerPhone: string }) {
  const toast = useToast();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const targets = useExtensions();
  const navigate = useNavigate();
  const [pick, setPick] = useState<Target | null>(null);
  const [direct, setDirect] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // 넘기는 중에는 바깥을 눌러도 닫지 않는다(결과를 보여 줘야 하므로)
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    setPick(null);
    setDirect('');
    const down = (e: PointerEvent) => {
      if (!busyRef.current && !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [open]);

  const directNo = direct.replace(/\D/g, '');
  const target: Target | null =
    pick ??
    (directNo.length >= 7 ? { id: '', label: '직접 입력', dept: null, number: directNo } : null);

  const go = async () => {
    if (!target) return;
    setBusy(true);
    const r = await transferTo(target, customerPhone);
    setBusy(false);
    toast({ type: r.ok ? 'success' : 'error', title: r.message });
    if (r.ok) setOpen(false);
  };

  return (
    <span className={styles.padWrap} ref={box}>
      <button
        type="button"
        className={`${styles.ghost} ${open ? styles.ghostOn : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <PhoneForwarded size={16} /> 돌려주기
      </button>
      {open && (
        <div className={styles.xfer} role="dialog" aria-label="돌려주기">
          <b className={styles.xferHead}>누구에게 돌려줄까요?</b>
          <div className={styles.xferList}>
            {targets.length === 0 && (
              <p className={styles.xferEmpty}>
                등록된 내선이 없습니다. 아래에 번호를 직접 넣어 주세요.
              </p>
            )}
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                className={pick?.id === t.id ? styles.xferOn : undefined}
                onClick={() => {
                  setPick(t);
                  setDirect('');
                }}
              >
                <span>
                  {t.label}
                  {t.dept && <em> {t.dept}</em>}
                </span>
                <small>{formatPhone(t.number)}</small>
              </button>
            ))}
          </div>
          <Input
            value={direct}
            inputMode="tel"
            placeholder="직접 입력 — 예: 070-1234-5678"
            onChange={(e) => {
              setDirect(e.target.value);
              setPick(null);
            }}
          />
          <div className={styles.xferFoot}>
            {can('CS_CALL.ALL') && (
              <button
                type="button"
                className={styles.xferManage}
                onClick={() => {
                  setOpen(false);
                  navigate('/extensions');
                }}
              >
                <Settings2 size={13} /> 내선 관리
              </button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={!target || busy}
              onClick={() => void go()}
            >
              {busy ? '넘기는 중…' : target ? `${target.label}에게 돌려주기` : '돌려주기'}
            </Button>
          </div>
          <small className={styles.xferHint}>
            상대가 받으면 내 통화는 끊깁니다. 받지 않으면 고객과 통화가 그대로 이어집니다.
          </small>
        </div>
      )}
    </span>
  );
}
