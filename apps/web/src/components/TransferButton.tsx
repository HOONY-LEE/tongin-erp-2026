import { useEffect, useRef, useState } from 'react';
import { PhoneForwarded, Plus, Settings2, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { transferCall } from '../lib/softphone';
import { useAuth } from '../auth/AuthContext';
import { Button, Input, Modal, useToast } from './ui';
import styles from './SoftphoneBar.module.css';

interface Target {
  id: string;
  label: string;
  number: string;
}

/**
 * 통화 막대 [돌려주기] — 사무실 직원·부서로 지금 통화를 넘긴다.
 * 목록에서 고르거나 번호를 직접 넣고 [돌려주기]. 상대가 받으면 내 통화는 끊기고, 콜에 넘긴 곳이 남는다.
 * 상담 관리자는 [연락처 관리]로 목록을 고친다.
 */
export function TransferButton({ customerPhone }: { customerPhone: string }) {
  const toast = useToast();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [pick, setPick] = useState<Target | null>(null);
  const [direct, setDirect] = useState('');
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // 넘기는 중에는 바깥을 눌러도 닫지 않는다(결과를 보여 줘야 하므로)
  const busyRef = useRef(false);
  busyRef.current = busy;

  const load = () =>
    api<Target[]>('/cs-transfer-targets')
      .then(setTargets)
      .catch(() => setTargets([]));
  useEffect(() => {
    if (!open) return;
    void load();
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
    pick ?? (directNo.length >= 7 ? { id: '', label: '직접 입력', number: directNo } : null);

  const go = async () => {
    if (!target) return;
    setBusy(true);
    const who = `${target.label} ${formatPhone(target.number)}`;
    const r = await transferCall(target.number);
    setBusy(false);
    if (r.ok) {
      toast({ type: 'success', title: `${who}에게 돌려줬습니다` });
      setOpen(false);
      void api('/cs-calls/transferred', {
        method: 'POST',
        body: JSON.stringify({ phone: customerPhone, to: who }),
      }).catch(() => undefined);
    } else {
      toast({ type: 'error', title: `돌려주지 못했습니다 — ${r.reason ?? ''}` });
    }
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
                등록된 연락처가 없습니다. 아래에 번호를 직접 넣어 주세요.
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
                <span>{t.label}</span>
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
                  setManage(true);
                }}
              >
                <Settings2 size={13} /> 연락처 관리
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
      {manage && <TargetManager onClose={() => setManage(false)} />}
    </span>
  );
}

/** 돌려주기 연락처 관리 — 이름·번호를 더하고 지운다(상담 관리자) */
function TargetManager({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Target[]>([]);
  const [label, setLabel] = useState('');
  const [number, setNumber] = useState('');
  const load = () =>
    api<Target[]>('/cs-transfer-targets')
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, []);
  const add = async () => {
    try {
      await api('/cs-transfer-targets', {
        method: 'POST',
        body: JSON.stringify({ label: label.trim(), number }),
      });
      setLabel('');
      setNumber('');
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    }
  };
  const remove = async (t: Target) => {
    try {
      await api(`/cs-transfer-targets/${t.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="돌려주기 연락처">
      <div className={styles.xferMgr}>
        <ul>
          {rows.map((t) => (
            <li key={t.id}>
              <b>{t.label}</b>
              <span>{formatPhone(t.number)}</span>
              <button type="button" aria-label={`${t.label} 지우기`} onClick={() => void remove(t)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className={styles.xferEmpty}>아직 연락처가 없습니다.</li>}
        </ul>
        <div className={styles.xferAdd}>
          <Input
            value={label}
            maxLength={40}
            placeholder="이름·부서 — 예: 영업팀 홍길동"
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            value={number}
            inputMode="tel"
            placeholder="번호 — 예: 070-1234-5678"
            onChange={(e) => setNumber(e.target.value)}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!label.trim() || number.replace(/\D/g, '').length < 7}
            onClick={() => void add()}
          >
            <Plus size={14} /> 추가
          </Button>
        </div>
      </div>
    </Modal>
  );
}
