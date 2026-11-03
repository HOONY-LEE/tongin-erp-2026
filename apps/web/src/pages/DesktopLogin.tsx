import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { PRODUCT_NAME } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { DEMO_ACCOUNTS, DEMO_GROUPS, REMEMBER_KEY, readRemembered } from '../lib/demoAccounts';
import styles from './desktopLogin.module.css';

const REMEMBER_NAME_KEY = 'tongin.rememberName';

interface Picked {
  loginId: string;
  name: string;
  desc: string;
  /** 데모 계정이면 비밀번호를 채워 둔다 */
  password?: string;
}

/** 고리 가운데 자물쇠(검은 채움) */
function LockIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.5 10.5V9a3.5 3.5 0 0 1 7 0v1.5"
        stroke="var(--login-lock, #111111)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="4.5" y="10" width="15" height="10.5" rx="3" fill="var(--login-lock, #111111)" />
      <circle cx="12" cy="14.3" r="1.5" fill="var(--ark-color-bg, #fff)" />
      <rect
        x="11.35"
        y="14.3"
        width="1.3"
        height="3.2"
        rx="0.65"
        fill="var(--ark-color-bg, #fff)"
      />
    </svg>
  );
}

/**
 * 맥 '계정으로 로그인' 같은 도트 고리 — 네 줄의 점이 천천히 함께 돌고, 색은 화면 위치(각도)에 따라 정해진다.
 * 가운데는 자물쇠(처음) 또는 고른 사람 이름 첫 글자.
 */
function SignInRing({
  center,
  size = 220,
  gap = 0,
}: {
  center: React.ReactNode;
  size?: number;
  gap?: number;
}) {
  const BOX = 220 + gap * 2;
  const c = BOX / 2;
  const N = 28;
  const cols = [
    { r: 62 + gap, s: 3.1, o: 0.85, phase: 0 },
    { r: 74 + gap, s: 3.45, o: 0.92, phase: 0.5 },
    { r: 86 + gap, s: 3.75, o: 0.97, phase: 0 },
    { r: 98 + gap, s: 4.05, o: 1, phase: 0.5 },
  ];
  /** 위쪽 기준 각도 → 색(주황에서 시작해 한 바퀴) */
  const hueOf = (a: number) => {
    let deg = ((a + Math.PI / 2) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return (((20 - deg) % 360) + 360) % 360;
  };
  const dots = cols.flatMap((col) =>
    Array.from({ length: N }, (_, i) => {
      const a0 = ((i + col.phase) / N) * Math.PI * 2 - Math.PI / 2;
      return { a0, r: col.r, s: col.s, o: col.o, delay: ((i + col.phase) / N) * 0.9 };
    }),
  );
  const refs = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const SPIN = 46; // 한 바퀴 초
    const tick = (now: number) => {
      const t = now / 1000;
      dots.forEach((d, k) => {
        const el = refs.current[k];
        if (!el) return;
        const ang = d.a0 + (t / SPIN) * Math.PI * 2;
        el.setAttribute('cx', (c + Math.cos(ang) * d.r).toFixed(2));
        el.setAttribute('cy', (c + Math.sin(ang) * d.r).toFixed(2));
        el.setAttribute('fill', `hsl(${hueOf(ang).toFixed(0)} 88% 62%)`);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // 고리 크기(gap)가 바뀔 때만 다시 잡는다
  }, [c, gap]);

  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden>
        {dots.map((d, k) => (
          <circle
            key={k}
            ref={(el) => {
              refs.current[k] = el;
            }}
            className={styles.dot}
            cx={c + Math.cos(d.a0) * d.r}
            cy={c + Math.sin(d.a0) * d.r}
            r={d.s}
            fill={`hsl(${hueOf(d.a0).toFixed(0)} 88% 62%)`}
            style={
              {
                '--dot-o': String(d.o),
                animationDelay: `${d.delay}s, ${1 + d.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
      <div className={styles.ringCenter}>{center}</div>
    </div>
  );
}

/**
 * 데스크톱 앱 로그인 — 작은 고정 창(600×860)에 맞춘 맥 앱 느낌.
 *  처음: 도트 고리(가운데 자물쇠) · 아이디/비밀번호 · 아래 데모 계정 목록
 *  계정을 고르면: 고리 가운데 이름 첫 글자 · 비밀번호만 넣고 로그인
 * 웹은 기존 로그인 화면(pages/Login.tsx)을 그대로 쓴다.
 */
export default function DesktopLogin() {
  const { login } = useAuth();
  const remembered = readRemembered();
  const [picked, setPicked] = useState<Picked | null>(() => {
    try {
      const name = localStorage.getItem(REMEMBER_NAME_KEY);
      return remembered && name ? { loginId: remembered, name, desc: remembered } : null;
    } catch {
      return null;
    }
  });
  const [loginId, setLoginId] = useState(remembered ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(remembered !== null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doLogin = async (id: string, pw: string, name?: string) => {
    if (loading || !id || !pw) return;
    setLoading(true);
    setError('');
    try {
      await login(id, pw);
      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, id);
          if (name) localStorage.setItem(REMEMBER_NAME_KEY, name);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(REMEMBER_NAME_KEY);
        }
      } catch {
        /* 기억하기만 건너뛴다 */
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '아이디 또는 비밀번호를 다시 확인해 주세요.');
      setLoading(false);
    }
  };

  const pick = (p: Picked) => {
    setPicked(p);
    setPassword(p.password ?? '');
    setError('');
  };

  if (picked) {
    return (
      <div className={styles.page}>
        <form
          className={styles.account}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void doLogin(picked.loginId, password, picked.name);
          }}
        >
          <SignInRing
            size={232}
            gap={34}
            center={<span className={styles.avatar}>{picked.name.slice(0, 1)}</span>}
          />
          <h2 className={styles.name}>{picked.name}</h2>
          <p className={styles.sub}>{picked.desc}</p>
          <input
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            type="password"
            value={password}
            placeholder="비밀번호"
            autoFocus
            autoComplete="current-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.primary} disabled={loading || !password}>
            {loading ? '로그인 중…' : '로그인'}
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setPicked(null);
              setPassword('');
              setError('');
            }}
          >
            다른 계정으로 로그인
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.landing}>
        <div className={styles.head}>
          <SignInRing size={180} center={<LockIcon />} />
          <h1 className={styles.title}>{PRODUCT_NAME} 로그인</h1>
        </div>

        <form
          className={styles.form}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void doLogin(loginId.trim(), password);
          }}
        >
          <input
            className={styles.input}
            value={loginId}
            placeholder="아이디"
            autoComplete="username"
            autoFocus={!loginId}
            onChange={(e) => {
              setLoginId(e.target.value);
              setError('');
            }}
          />
          <input
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            type="password"
            value={password}
            placeholder="비밀번호"
            autoComplete="current-password"
            autoFocus={!!loginId}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="submit"
            className={styles.primary}
            disabled={loading || loginId.trim().length < 2 || password.length < 2}
          >
            {loading ? '로그인 중…' : '로그인'}
          </button>
          <label className={styles.remember}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            아이디 기억하기
          </label>
        </form>

        <div className={styles.listWrap}>
          <div className={styles.list} role="list" aria-label="데모 계정">
            {DEMO_GROUPS.map((g) => (
              <div key={g} role="group" aria-label={g}>
                <div className={styles.group}>{g}</div>
                {DEMO_ACCOUNTS.filter((a) => a.group === g).map((a) => (
                  <button
                    key={a.loginId}
                    type="button"
                    className={styles.row}
                    onClick={() =>
                      pick({
                        loginId: a.loginId,
                        name: a.name,
                        desc: `${a.group} · ${a.desc}`,
                        password: a.password,
                      })
                    }
                  >
                    <span className={styles.rowAvatar}>{a.name.slice(0, 1)}</span>
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{a.name}</span>
                      <span className={styles.rowDesc}>{a.desc}</span>
                    </span>
                    <ChevronRight size={16} className={styles.chev} aria-hidden />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className={styles.hint}>데모 계정을 고르면 바로 로그인할 수 있습니다</p>
      </div>
    </div>
  );
}
