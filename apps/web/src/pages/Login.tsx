import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SearchInput } from '../components/ui/SearchInput';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import { PRODUCT_NAME } from '@tongin/shared';
import { useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';
import {
  DEMO_ACCOUNTS,
  DEMO_GROUPS,
  REMEMBER_KEY,
  readRemembered,
  useDemoLogin,
  matchDemo,
  type DemoAccount,
} from '../lib/demoAccounts';
import styles from './login.module.css';

/** 데모 계정 드롭다운 — 고르면 아이디·비밀번호를 채우고 바로 로그인한다 */
function DemoAccountMenu({
  disabled,
  selected,
  onPick,
}: {
  disabled: boolean;
  selected: string | null;
  onPick: (a: DemoAccount) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = DEMO_ACCOUNTS.find((a) => a.loginId === selected);

  return (
    <div className={styles.demo} ref={box}>
      <span className={styles.label}>{t('signin.demoLogin')}</span>
      <button
        type="button"
        className={[styles.demoTrigger, open ? styles.demoOpen : ''].join(' ')}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <UserRound size={18} className={styles.demoIcon} />
        <span className={current ? styles.demoValue : styles.demoPlaceholder}>
          {current ? `${current.group} · ${current.name} (${current.desc})` : t('signin.demoPick')}
        </span>
        <ChevronDown size={18} className={styles.demoChevron} />
      </button>
      {open && (
        <div className={styles.demoMenu} role="listbox" aria-label={t('signin.demo')}>
          <div className={styles.demoSearch}>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder={t('signin.demoSearch')}
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          {!DEMO_ACCOUNTS.some((a) => matchDemo(a, q)) && (
            <div className={styles.demoGroup}>{t('signin.demoNone')}</div>
          )}
          {DEMO_GROUPS.filter((g) =>
            DEMO_ACCOUNTS.some((a) => a.group === g && matchDemo(a, q)),
          ).map((g) => (
            <div key={g} role="group" aria-label={g}>
              <div className={styles.demoGroup}>{g}</div>
              {DEMO_ACCOUNTS.filter((a) => a.group === g && matchDemo(a, q)).map((a) => (
                <button
                  key={a.loginId}
                  type="button"
                  role="option"
                  aria-selected={a.loginId === selected}
                  className={styles.demoItem}
                  onClick={() => {
                    setOpen(false);
                    onPick(a);
                  }}
                >
                  <span className={styles.demoName}>{a.name}</span>
                  <span className={styles.demoDesc}>
                    {a.desc} · {a.loginId}
                  </span>
                  {a.loginId === selected && <Check size={16} className={styles.demoCheck} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 로그인 — 전자계약시스템 로그인과 같은 디자인.
 * PC·태블릿 가로 = 좌(브랜드)·우(폼) 2분할 / 태블릿 세로·모바일 = 위 배너 + 아래 폼.
 */
export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const remembered = readRemembered();
  const [loginId, setLoginId] = useState(remembered ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(remembered !== null);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState<string | null>(null);
  const showDemo = useDemoLogin();

  const active = loginId.trim().length > 1 && password.length > 1;

  const doLogin = async (id: string, pw: string) => {
    if (loading) return;
    setLoading(true);
    try {
      await login(id, pw);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, id);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* 저장소를 못 쓰면 기억하기만 건너뛴다 */
      }
    } catch (err) {
      toast({
        type: 'error',
        title: err instanceof ApiError ? err.message : t('signin.failed'),
      });
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (active) void doLogin(loginId.trim(), password);
  };

  return (
    <div className={styles.page}>
      {/* ── 브랜드 패널 ── */}
      <div className={styles.brand}>
        <div className={[styles.circle, styles.circleA].join(' ')} />
        <div className={[styles.circle, styles.circleB].join(' ')} />
        <div className={styles.logo}>
          {/* 로고 자체가 주황색이라 흰색으로 보이게 필터 */}
          <img src="/brand/tongin-tiger.svg" alt="" />
        </div>
        <div className={styles.copy}>
          <div className={styles.slogan}>{t('signin.slogan')}</div>
          <div className={styles.title}>{PRODUCT_NAME}</div>
          <div className={styles.lead}>
            {t('signin.lead1')}
            <br className={styles.wideBr} />
            <span className={styles.narrowSp}> </span>
            {t('signin.lead2')}
          </div>
        </div>
      </div>

      {/* ── 폼 패널 ── */}
      <div className={styles.formPane}>
        <div className={styles.switchers}>
          <LangSwitch />
          <ThemeSwitch />
        </div>
        <form className={styles.form} onSubmit={onSubmit}>
          <h1 className={styles.h1}>{t('common.login')}</h1>
          <p className={styles.sub}>{t('signin.sub')}</p>

          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={styles.label}>{t('login.id')}</span>
              <span className={styles.shell}>
                <input
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    setDemo(null);
                  }}
                  placeholder={t('signin.idPh')}
                  autoComplete="username"
                  autoFocus={!remembered}
                />
              </span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('login.password')}</span>
              <span className={styles.shell}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setDemo(null);
                  }}
                  placeholder={t('signin.pwPh')}
                  autoComplete="current-password"
                  autoFocus={!!remembered}
                />
              </span>
            </label>
          </div>

          <button
            type="button"
            className={styles.toggle}
            onClick={() => setRemember((v) => !v)}
            aria-pressed={remember}
          >
            <span className={[styles.track, remember ? styles.on : ''].join(' ')}>
              <span className={styles.knob} />
            </span>
            <span className={styles.toggleLabel}>{t('signin.remember')}</span>
          </button>

          <button
            type="submit"
            className={[styles.submit, active ? styles.submitOn : ''].join(' ')}
            disabled={!active || loading}
          >
            {loading ? (
              <span className={styles.spinner} aria-label={t('signin.loggingIn')} />
            ) : (
              t('common.login')
            )}
          </button>

          {showDemo && (
            <>
              <div className={styles.divider}>
                <span>{t('signin.or')}</span>
              </div>

              <DemoAccountMenu
                disabled={loading}
                selected={demo}
                onPick={(a) => {
                  setDemo(a.loginId);
                  setLoginId(a.loginId);
                  setPassword(a.password);
                  void doLogin(a.loginId, a.password);
                }}
              />
            </>
          )}

          <div className={styles.copyright}>{t('signin.copyright')}</div>
        </form>
      </div>
    </div>
  );
}
