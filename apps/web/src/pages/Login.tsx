import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import { useToast } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';
import styles from './login.module.css';

// apps/api/prisma/seed-demo.ts·seeder의 데모 계정과 짝을 맞춘 목록(시연용).
// 비밀번호는 seed-demo.ts의 DEMO_PASSWORD 기본값('tongin1234'). env로 바꿔 시드했다면 이 목록도 맞춰야 한다.
const DEMO_PASSWORD = 'tongin1234';
interface DemoAccount {
  group: string;
  loginId: string;
  password: string;
  name: string;
  desc: string;
}
const DEMO_ACCOUNTS: DemoAccount[] = [
  // 운영 admin 비밀번호는 ADMIN_PASSWORD로 따로 정하므로 개발에서만 보여 준다
  ...(import.meta.env.DEV
    ? [{ group: '관리자', loginId: 'admin', password: 'admin1234', name: '관리자', desc: 'admin' }]
    : []),
  {
    group: '지점장',
    loginId: 'gn.manager',
    password: DEMO_PASSWORD,
    name: '김성호',
    desc: '강남점',
  },
  {
    group: '지점장',
    loginId: 'sp.manager',
    password: DEMO_PASSWORD,
    name: '정우진',
    desc: '송파점',
  },
  {
    group: '지점장',
    loginId: 'bd.manager',
    password: DEMO_PASSWORD,
    name: '한지원',
    desc: '분당점',
  },
  {
    group: '지점장',
    loginId: 'is.manager',
    password: DEMO_PASSWORD,
    name: '윤태경',
    desc: '일산점',
  },
  {
    group: '지점장',
    loginId: 'bs.manager',
    password: DEMO_PASSWORD,
    name: '서준호',
    desc: '부산점',
  },
  {
    group: '가맹점',
    loginId: 'franchise',
    password: 'franchise1234',
    name: '가맹점',
    desc: '분당서현점',
  },
  { group: '현장', loginId: 'gn.field', password: DEMO_PASSWORD, name: '박민수', desc: '강남점' },
  { group: '현장', loginId: 'sp.field', password: DEMO_PASSWORD, name: '최동혁', desc: '송파점' },
  { group: '현장', loginId: 'is.field', password: DEMO_PASSWORD, name: '강현우', desc: '일산점' },
  {
    group: '전속업체',
    loginId: 'hanil.partner',
    password: DEMO_PASSWORD,
    name: '한일운수',
    desc: '전속업체',
  },
  {
    group: '전속업체',
    loginId: 'daeyang.partner',
    password: DEMO_PASSWORD,
    name: '대양물류',
    desc: '전속업체',
  },
];
const DEMO_GROUPS = [...new Set(DEMO_ACCOUNTS.map((a) => a.group))];

const REMEMBER_KEY = 'tongin.rememberId';

/** 기억해 둔 아이디(비밀번호는 저장하지 않는다) */
function readRemembered(): string | null {
  try {
    return localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

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
  const [open, setOpen] = useState(false);
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
      <span className={styles.label}>데모 계정으로 로그인</span>
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
          {current
            ? `${current.group} · ${current.name} (${current.desc})`
            : '데모 계정을 선택하세요'}
        </span>
        <ChevronDown size={18} className={styles.demoChevron} />
      </button>
      {open && (
        <div className={styles.demoMenu} role="listbox" aria-label="데모 계정">
          {DEMO_GROUPS.map((g) => (
            <div key={g} role="group" aria-label={g}>
              <div className={styles.demoGroup}>{g}</div>
              {DEMO_ACCOUNTS.filter((a) => a.group === g).map((a) => (
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
        title: err instanceof ApiError ? err.message : '아이디 또는 비밀번호를 다시 확인해주세요.',
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
          <div className={styles.slogan}>마음까지 통하는 사람들</div>
          <div className={styles.title}>통인전산시스템</div>
          <div className={styles.lead}>
            언제 어디서나 빠르고 정확하게.
            <br className={styles.wideBr} />
            <span className={styles.narrowSp}> </span>
            접수부터 정산까지 한 곳에서 관리하세요.
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
          <p className={styles.sub}>계속하려면 계정 정보를 입력해주세요.</p>

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
                  placeholder="아이디를 입력해 주세요"
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
                  placeholder="비밀번호를 입력해 주세요"
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
            <span className={styles.toggleLabel}>아이디 기억하기</span>
          </button>

          <button
            type="submit"
            className={[styles.submit, active ? styles.submitOn : ''].join(' ')}
            disabled={!active || loading}
          >
            {loading ? (
              <span className={styles.spinner} aria-label="로그인 중" />
            ) : (
              t('common.login')
            )}
          </button>

          <div className={styles.divider}>
            <span>또는</span>
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

          <div className={styles.copyright}>© 통인익스프레스. All rights reserved.</div>
        </form>
      </div>
    </div>
  );
}
