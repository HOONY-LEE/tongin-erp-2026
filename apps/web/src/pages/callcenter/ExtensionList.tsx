import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneForwarded, Settings2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  extName,
  searchExtensions,
  transferTo,
  useExtensions,
  type Extension,
} from '../../lib/extensions';
import { usePhone } from '../../lib/softphone';
import { SearchInput, useToast } from '../../components/ui';
import styles from '../callcenter.module.css';

/**
 * 상담 콘솔 '내선' 목록 — 통화 중이면 이름 옆 [돌려주기]를 눌러 바로 넘긴다.
 * 한 번 누르면 [확인]으로 바뀌고(실수 방지), 한 번 더 누르면 넘어간다.
 */
export function ExtensionList() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const phone = usePhone();
  const list = useExtensions();
  const [q, setQ] = useState('');
  const [arm, setArm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const live = phone.call?.state === 'active';

  // [확인]은 4초 뒤 원래대로
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(null), 4000);
    return () => clearTimeout(t);
  }, [arm]);

  const rows = useMemo(() => searchExtensions(list, q), [list, q]);

  const go = async (x: Extension) => {
    if (!phone.call) return;
    if (arm !== x.id) {
      setArm(x.id);
      return;
    }
    setArm(null);
    setBusy(x.id);
    const r = await transferTo(x, phone.call.number);
    setBusy(null);
    toast({ type: r.ok ? 'success' : 'error', title: r.message });
  };

  return (
    <div className={styles.extWrap}>
      {list.length > 0 && (
        <SearchInput value={q} onChange={setQ} placeholder="이름·부서·내선·번호로 찾기" />
      )}
      {list.length === 0 ? (
        <div className={styles.extEmpty}>
          <p>등록된 내선이 없습니다.</p>
          {can('CS_CALL.ALL') && (
            <button type="button" className={styles.link} onClick={() => navigate('/extensions')}>
              <Settings2 size={13} /> 내선 등록하기
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.extList}>
          {rows.length === 0 && <li className={styles.extNone}>찾는 내선이 없습니다</li>}
          {rows.map((x) => (
            <li key={x.id}>
              <span className={styles.extMain}>
                <b>{x.label}</b>
                <span className={styles.extSub}>
                  {[x.dept, x.extNo && `내선 ${x.extNo}`].filter(Boolean).join(' · ') || extName(x)}
                  {x.memo && ` · ${x.memo}`}
                </span>
              </span>
              <button
                type="button"
                className={`${styles.extGo} ${arm === x.id ? styles.extArm : ''}`}
                disabled={!live || !!busy}
                title={live ? `${x.label}에게 돌려주기` : '통화 중일 때 돌려줄 수 있습니다'}
                onClick={() => void go(x)}
              >
                <PhoneForwarded size={13} />
                {busy === x.id ? '넘기는 중…' : arm === x.id ? '확인' : '돌려주기'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
