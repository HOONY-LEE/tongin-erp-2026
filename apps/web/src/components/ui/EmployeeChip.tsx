import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Mail, Phone } from 'lucide-react';
import { formatPhone } from '../../lib/phone';
import { EmployeeAvatar } from '../employee/EmployeeAvatar';
import styles from './EmployeeChip.module.css';

export interface EmployeeBrief {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: { name: string } | null;
  orgUnit?: { name: string } | null;
  /** 프로필 사진이 바뀐 시각(없으면 사진 없음) */
  photoAt?: string | null;
  isActive?: boolean;
  resignDate?: string | null;
}

/** 재직 상태 — 퇴사일이 있으면 퇴사, 아니면 활성 여부 */
const statusOf = (e: EmployeeBrief) =>
  e.resignDate ? '퇴사' : e.isActive === false ? '비활성' : '재직';

/** 직원 칩 — 누르면 프로필 요약(이름·직책·소속·연락처)이 뜨고, '자세히'는 직원 상세 화면으로 */
export function EmployeeChip({ emp }: { emp: EmployeeBrief }) {
  const navigate = useNavigate();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 칩 바로 아래(화면 밖으로 나가면 위로·왼쪽으로 당긴다)
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = pop.current?.offsetWidth ?? 260;
    const h = pop.current?.offsetHeight ?? 160;
    const top = r.bottom + 6 + h > window.innerHeight ? r.top - 6 - h : r.bottom + 6;
    const left = Math.min(r.left, window.innerWidth - w - 12);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const sub = [emp.position?.name, emp.orgUnit?.name].filter(Boolean).join(' · ');
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`emp-chip ${styles.chip} ${open ? styles.chipOn : ''}`}
        onClick={(e) => {
          e.stopPropagation(); // 표의 행 클릭(상세 열기)과 겹치지 않게
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <EmployeeAvatar id={emp.id} name={emp.name} photoAt={emp.photoAt} size={20} />
        {emp.name}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={`${emp.name} 프로필`}
            className={styles.pop}
            style={pos ?? { visibility: 'hidden', top: 0, left: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <EmployeeAvatar id={emp.id} name={emp.name} photoAt={emp.photoAt} size={48} />
              <div>
                <b>
                  {emp.name}
                  <span
                    className={`${styles.status} ${statusOf(emp) === '재직' ? styles.statusOn : ''}`}
                  >
                    {statusOf(emp)}
                  </span>
                </b>
                {sub && <small>{sub}</small>}
              </div>
            </div>
            {
              <dl className={styles.info}>
                <div>
                  <dt>
                    <Phone size={13} aria-label="연락처" />
                  </dt>
                  <dd className={emp.phone ? 'dt-num' : styles.none}>
                    {emp.phone ? formatPhone(emp.phone) : '연락처 없음'}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Mail size={13} aria-label="이메일" />
                  </dt>
                  <dd className={emp.email ? undefined : styles.none}>
                    {emp.email ?? '이메일 없음'}
                  </dd>
                </div>
              </dl>
            }
            <button
              type="button"
              className={styles.more}
              onClick={() => {
                setOpen(false);
                navigate(`/org-mgmt?tab=emp&detail=${encodeURIComponent(emp.id)}`);
              }}
            >
              자세히
              <ChevronRight size={14} aria-hidden />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
