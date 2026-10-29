import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Clock,
  Globe,
  LogOut,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { SUPPORTED_LANGS, setLang } from '../i18n';
import { useClock } from '../components/attendance/ClockButton';
import { MyAccountModal } from './MyAccountModal';
import styles from './profileMenu.module.css';

const THEMES: { value: ThemeMode; icon: LucideIcon }[] = [
  { value: 'system', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
];

/** 출퇴근 줄 — 직원 계정에만(오늘 기록·버튼) */
function ClockRow() {
  const { today, busy, clock } = useClock();
  if (!today) return null;
  const status = today.leave
    ? `오늘 ${today.leave}`
    : today.clockIn
      ? `출근 ${today.clockIn}${today.clockOut ? ` · 퇴근 ${today.clockOut}` : ''}`
      : '아직 출근 전';
  const action = today.clockOut ? null : today.clockIn ? 'OUT' : today.leave ? null : 'IN';
  return (
    <div className={styles.clockRow}>
      <Clock size={15} aria-hidden />
      <span className={styles.clockText}>{status}</span>
      {action && (
        <button
          type="button"
          className={`${styles.clockBtn} ${action === 'IN' ? styles.clockIn : ''}`}
          disabled={busy}
          onClick={() => void clock(action)}
        >
          {action === 'IN' ? '출근하기' : '퇴근하기'}
        </button>
      )}
    </div>
  );
}

/**
 * 머리글 오른쪽 끝 프로필 — 누르면 내 계정·언어·테마·내 메뉴 편집·출퇴근·로그아웃.
 * 사이드바에는 메뉴만 남긴다.
 */
export function ProfileMenu({ onEditMenu }: { onEditMenu: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  const [account, setAccount] = useState(false);

  useEffect(() => {
    if (!pos) return;
    const down = (e: PointerEvent) => {
      const el = e.target as Node;
      if (panelRef.current?.contains(el) || btnRef.current?.contains(el)) return;
      setPos(null);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    const close = () => setPos(null);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 6 });
  };
  const run = (fn: () => void) => () => {
    setPos(null);
    fn();
  };

  const name = user?.employeeName ?? user?.loginId ?? '';
  const initial = name.slice(0, 1);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.trigger} ${pos ? styles.triggerOn : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        title="내 프로필"
      >
        <span className={styles.avatar} aria-hidden>
          {initial}
        </span>
        <span className={styles.triggerName}>{name}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {pos &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{ right: pos.right, top: pos.top }}
            role="menu"
            aria-label="내 프로필"
          >
            <div className={styles.head}>
              <span className={`${styles.avatar} ${styles.avatarLg}`} aria-hidden>
                {initial}
              </span>
              <div className={styles.headText}>
                <b>{name}</b>
                <span>{[user?.positionName, user?.loginId].filter(Boolean).join(' · ')}</span>
              </div>
            </div>

            {user?.employeeId && <ClockRow />}

            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={run(() => setAccount(true))}
            >
              <UserRound size={15} aria-hidden />내 계정
            </button>
            <button type="button" role="menuitem" className={styles.item} onClick={run(onEditMenu)}>
              <SlidersHorizontal size={15} aria-hidden />내 메뉴 편집
            </button>

            <div className={styles.group}>
              <span className={styles.groupLabel}>
                <Globe size={15} aria-hidden />
                {t('lang.label')}
              </span>
              <div className={styles.seg} role="radiogroup" aria-label={t('lang.label')}>
                {SUPPORTED_LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    role="radio"
                    aria-checked={i18n.language === l.code}
                    className={i18n.language === l.code ? styles.segOn : undefined}
                    onClick={() => setLang(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>
                <Monitor size={15} aria-hidden />
                {t('theme.label')}
              </span>
              <div className={styles.seg} role="radiogroup" aria-label={t('theme.label')}>
                {THEMES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.value}
                    className={mode === o.value ? styles.segOn : undefined}
                    onClick={() => setMode(o.value)}
                  >
                    <o.icon size={13} aria-hidden />
                    {t(`theme.${o.value}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.sep} />
            <button type="button" role="menuitem" className={styles.item} onClick={run(logout)}>
              <LogOut size={15} aria-hidden />
              {t('common.logout')}
            </button>
          </div>,
          document.body,
        )}
      <MyAccountModal open={account} onClose={() => setAccount(false)} />
    </>
  );
}
