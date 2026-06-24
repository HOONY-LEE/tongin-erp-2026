import { useState, type FormEvent } from 'react';
import { Button, Card, Input, useToast } from '../components/ui';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { LangSwitch, ThemeSwitch } from '../components/Switchers';

export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const [loginId, setLoginId] = useState('admin');
  const [password, setPassword] = useState('admin1234');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginId, password);
    } catch (err) {
      toast({ type: 'error', title: err instanceof ApiError ? err.message : t('login.failed') });
    } finally {
      setLoading(false);
    }
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
              autoFocus
            />
            <Input
              label={t('login.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="primary" size="md" disabled={loading}>
              {t('common.login')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
