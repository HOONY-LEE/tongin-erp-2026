import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';

/**
 * 현장(폰·태블릿) 셸.
 * 관리자 ERP 셸과 분리한 이유 — 관리자 화면은 데스크톱 밀도의 표·폼이라 현장에서 못 쓴다.
 * 여기는 한 손 조작·큰 터치영역·세로 스크롤만 전제로 한다.
 */
export default function FieldLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  // 관리자도 현장 화면을 열어볼 수 있어야 하므로 ERP로 돌아가는 문을 남긴다
  const canSeeAdmin = can('STATS.READ') || can('LEAD.READ');

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ark-color-bg-subtle)',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'var(--ark-color-bg)',
          borderBottom: '1px solid var(--ark-color-gray-200)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/field')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--ark-color-primary-500)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            통
          </span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>현장</span>
        </button>

        <span
          style={{
            fontSize: 13,
            color: 'var(--ark-color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 120,
          }}
        >
          {user?.loginId}
        </span>
        {canSeeAdmin && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} aria-label="관리자 화면">
            <ShieldCheck size={18} />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={logout} aria-label="로그아웃">
          <LogOut size={18} />
        </Button>
      </header>

      <main style={{ flex: 1, padding: 16, maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
