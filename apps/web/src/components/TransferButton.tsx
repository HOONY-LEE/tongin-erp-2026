import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchInput } from './ui/SearchInput';
import { useNavigate } from 'react-router-dom';
import { PhoneForwarded, Settings2 } from 'lucide-react';
import { formatPhone } from '../lib/phone';
import { searchExtensions, transferTo, useExtensions, type Extension } from '../lib/extensions';
import { useAuth } from '../auth/AuthContext';
import { Button, useToast } from './ui';
import styles from './SoftphoneBar.module.css';

type Target = Pick<Extension, 'id' | 'label' | 'dept' | 'number'> & { extNo?: string | null };

/**
 * 통화 막대 [돌려주기] — 사무실 직원·부서로 지금 통화를 넘긴다.
 * 목록에서 고르거나 번호를 직접 넣고 [돌려주기]. 상대가 받으면 내 통화는 끊기고, 콜에 넘긴 곳이 남는다.
 * 목록은 '내선 관리' 화면에서 고친다(상담 관리자).
 */
export function TransferButton({ customerPhone }: { customerPhone: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const targets = useExtensions();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // 넘기는 중에는 바깥을 눌러도 닫지 않는다(결과를 보여 줘야 하므로)
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    const down = (e: PointerEvent) => {
      if (!busyRef.current && !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [open]);

  // 이름·부서·내선·번호(초성도)로 찾는다. 목록에 없는 번호(7자리 이상)는 그 번호로 바로 돌려준다
  const found = useMemo(() => searchExtensions(targets, q), [targets, q]);
  const digits = q.replace(/\D/g, '');
  const direct: Target | null =
    /^[\d\s-]+$/.test(q.trim()) && digits.length >= 7
      ? { id: '', label: t('cc.typedNumber'), dept: null, number: digits }
      : null;
  const options: Target[] = direct ? [...found, direct] : found;
  useEffect(() => setSel(0), [q]);
  const target: Target | null = options[Math.min(sel, options.length - 1)] ?? null;

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
        <PhoneForwarded size={16} /> {t('cc.transfer')}
      </button>
      {open && (
        <div className={styles.xfer} role="dialog" aria-label={t('cc.transfer')}>
          <SearchInput
            autoFocus
            value={q}
            placeholder={t('cc.extSearchPh')}
            onChange={setQ}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((i) => Math.min(i + 1, options.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && target && !busy) {
                e.preventDefault();
                void go();
              } else if (e.key === 'Escape') setOpen(false);
            }}
          />
          <div className={styles.xferList} role="listbox">
            {options.length === 0 && (
              <p className={styles.xferEmpty}>
                {targets.length === 0 ? t('cc.noExtTyped') : t('cc.noExtMatchTyped')}
              </p>
            )}
            {options.map((opt, i) => (
              <button
                key={opt.id || 'direct'}
                type="button"
                role="option"
                aria-selected={target === opt}
                className={target === opt ? styles.xferOn : undefined}
                onMouseEnter={() => setSel(i)}
                onClick={() => setSel(i)}
                onDoubleClick={() => void go()}
              >
                <span className={styles.xferWho}>
                  <b>{opt.label}</b>
                  {(opt.dept || opt.extNo) && (
                    <em>
                      {[opt.dept, opt.extNo && t('cc.extN', { v0: opt.extNo })]
                        .filter(Boolean)
                        .join(' · ')}
                    </em>
                  )}
                </span>
                <span className={styles.xferNo}>{formatPhone(opt.number)}</span>
              </button>
            ))}
          </div>
          <div className={styles.xferFoot}>
            {can('CS_CALL.EXTENSIONS') && (
              <button
                type="button"
                className={styles.xferManage}
                onClick={() => {
                  setOpen(false);
                  navigate('/extensions');
                }}
              >
                <Settings2 size={13} /> {t('cc.manageExt')}
              </button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={!target || busy}
              onClick={() => void go()}
            >
              <PhoneForwarded size={15} /> {busy ? t('cc.transferring') : t('cc.transfer')}
            </Button>
          </div>
        </div>
      )}
    </span>
  );
}
