import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, Input, useToast } from '../components/ui';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';

// apps/api/prisma/seed-demo.ts 의 데모 계정과 짝을 맞춘 목록 — 데모/개발 편의용, 운영 빌드에는 노출 안 함.
// 비밀번호는 seed-demo.ts의 DEMO_PASSWORD 기본값('tongin1234'). env로 바꿔 시드했다면 이 목록도 맞춰야 함.
const DEMO_PASSWORD = 'tongin1234';
const DEMO_ACCOUNTS: { group: string; loginId: string; password: string; label: string }[] = [
  { group: '관리자', loginId: 'admin', password: 'admin1234', label: 'admin' },
  { group: '지점장', loginId: 'gn.manager', password: DEMO_PASSWORD, label: '김성호 · 강남점' },
  { group: '지점장', loginId: 'sp.manager', password: DEMO_PASSWORD, label: '정우진 · 송파점' },
  { group: '지점장', loginId: 'bd.manager', password: DEMO_PASSWORD, label: '한지원 · 분당점' },
  { group: '지점장', loginId: 'is.manager', password: DEMO_PASSWORD, label: '윤태경 · 일산점' },
  { group: '지점장', loginId: 'bs.manager', password: DEMO_PASSWORD, label: '서준호 · 부산점' },
  { group: '현장', loginId: 'gn.field', password: DEMO_PASSWORD, label: '박민수 · 강남점' },
  { group: '현장', loginId: 'sp.field', password: DEMO_PASSWORD, label: '최동혁 · 송파점' },
  { group: '현장', loginId: 'is.field', password: DEMO_PASSWORD, label: '강현우 · 일산점' },
  { group: '전속업체', loginId: 'hanil.partner', password: DEMO_PASSWORD, label: '한일운수' },
  { group: '전속업체', loginId: 'daeyang.partner', password: DEMO_PASSWORD, label: '대양물류' },
];
const DEMO_GROUPS = ['관리자', '지점장', '현장', '전속업체'] as const;

export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  // 개발 편의용 기본값은 개발 모드에서만. 운영 빌드에 남으면 기본 계정을 광고하는 꼴이 된다.
  const [loginId, setLoginId] = useState(import.meta.env.DEV ? 'admin' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'admin1234' : '');
  const [loading, setLoading] = useState(false);

  const doLogin = async (id: string, pw: string) => {
    setLoading(true);
    try {
      await login(id, pw);
    } catch (err) {
      toast({ type: 'error', title: err instanceof ApiError ? err.message : t('login.failed') });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await doLogin(loginId, password);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--ark-color-bg-subtle)',
      }}
    >
      <div style={{ width: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <LangSwitch />
          <ThemeSwitch />
        </div>
        <Card style={{ padding: 28 }}>
          <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: 24 }}>{t('app.title')}</h2>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label={t('login.id')}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              autoFocus
            />
            <Input
              label={t('login.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button type="submit" variant="primary" size="md" disabled={loading}>
              {t('common.login')}
            </Button>
          </form>
        </Card>

        {import.meta.env.DEV && (
          <Card style={{ padding: 20, marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>빠른 로그인 (데모)</span>
              <Badge variant="subtle" color="warning">
                더미 계정
              </Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {DEMO_GROUPS.map((group) => (
                <div key={group}>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ark-color-text-tertiary)',
                      marginBottom: 6,
                    }}
                  >
                    {group}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DEMO_ACCOUNTS.filter((a) => a.group === group).map((a) => (
                      <Button
                        key={a.loginId}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={() => {
                          setLoginId(a.loginId);
                          setPassword(a.password);
                          void doLogin(a.loginId, a.password);
                        }}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
