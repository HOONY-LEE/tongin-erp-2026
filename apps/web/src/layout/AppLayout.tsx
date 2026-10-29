import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import {
  LayoutSidebar,
  SidebarGroup,
  SidebarItem,
  NotificationBell,
  type EditorTab,
  type NotificationBellItem,
} from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useAiRunning } from '../lib/aiActivity';
import { usePendingApprovals } from '../lib/approvals';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MyMenuModal } from '../components/menu/MyMenuModal';
import { menuIcon, useMenuLabel, useMyMenu } from '../lib/menu';
import { useInbox } from '../lib/inbox';
import { MENU_CATALOG, filterLayout, menuDef } from '@tongin/shared';
import styles from './AppLayout.module.css';
import { HeaderTabs } from './HeaderTabs';
import { ProfileMenu } from './ProfileMenu';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: string;
  /** 자체 메뉴가 없는 하위 화면 경로 — 이 메뉴에 속한 것으로 보고 탭·선택표시를 유지한다.
   *  (예: 견적/계약/작업 상세는 접수 케이스의 문서라 '접수' 탭에 머물러야 한다) */
  owns?: string[];
  /** 권한 대신 '직원과 연결된 계정'이면 보인다(결재·휴가·근태 같은 본인 업무) */
  selfService?: boolean;
  /** 메뉴 이름 옆 숫자 배지(0이면 안 보임) */
  badge?: number;
};
/** defaultOpen=false면 처음엔 접어 둔다(그 그룹 화면에 있으면 펼친다) */
type NavGroup = { label?: string; items: NavItem[]; defaultOpen?: boolean };

const COLLAPSE_KEY = 'tongin_sidebar_collapsed';

/** 알림 종류별 색 — 결재 요청은 눈에 띄게, 반려 결과도 경고색 */
const INBOX_TYPE: Record<string, NotificationBellItem['type']> = {
  APPROVAL_REQUEST: 'warning',
  APPROVAL_RESULT: 'success',
  MENTION: 'info',
  TASK_ASSIGNED: 'warning',
  LEAD_ASSIGNED: 'warning',
  WORK_ASSIGNED: 'warning',
};

export default function AppLayout() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const setCol = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  };

  // 화면이 좁아지면 자동으로 접기(사용자가 수동으로 편 상태는 저장값 유지, 넓어지면 저장값으로 복원)
  // akron-ui LayoutSidebar 자체에 769~1024px 구간에서 라벨을 숨기는 내장 media query가 있어
  // 그 임계값(1024px)과 동일하게 맞춰야 "폭은 안 줄었는데 텍스트만 사라지는" 불일치 구간이 없다.
  useEffect(() => {
    const AUTO_COLLAPSE_WIDTH = 1024;
    const onResize = () => {
      const narrow = window.innerWidth < AUTO_COLLAPSE_WIDTH;
      setCollapsed(narrow ? true : localStorage.getItem(COLLAPSE_KEY) === '1');
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 내 결재 차례 건수 — 결재함 메뉴 배지
  const pendingApprovals = usePendingApprovals(!!user?.employeeId);

  // 사이드바 = 관리자 메뉴 구성(팀·권한 그룹·직책) + 내 메뉴 설정, 그다음 권한으로 거른다
  const myMenu = useMyMenu(user?.userId);
  const menuLabel = useMenuLabel();
  const [menuEditOpen, setMenuEditOpen] = useState(false);
  const canSeeMenu = (key: string) =>
    filterLayout({ groups: [{ label: '', items: [key] }] }, can, !!user?.employeeId).groups.length >
    0;
  const visibleGroups: NavGroup[] = filterLayout(myMenu.layout, can, !!user?.employeeId).groups.map(
    (g) => ({
      label: g.label,
      defaultOpen: !g.collapsed,
      items: g.items.map((key) => {
        const m = menuDef(key)!;
        return {
          to: m.path,
          label: menuLabel(key),
          icon: menuIcon(m),
          owns: m.owns,
          badge: key === 'approvals' ? pendingApprovals : undefined,
        };
      }),
    }),
  );
  // 탭·선택 표시는 사이드바에서 숨긴 메뉴도 알아야 한다(링크로 들어간 화면) — 권한 있는 전체 메뉴 기준
  const allItems: NavItem[] = MENU_CATALOG.filter((m) => canSeeMenu(m.key)).map((m) => ({
    to: m.path,
    label: menuLabel(m.key),
    icon: menuIcon(m),
    owns: m.owns,
  }));

  /** 이 메뉴가 현재 경로를 담당하는가 — 자기 경로이거나, owns에 등록된 하위 화면이거나. */
  // '/ai'가 '/ai-xxx' 같은 다른 경로까지 잡지 않게 — 같은 경로이거나 그 아래 경로만
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const ownsPath = (i: NavItem) => under(i.to) || (i.owns ?? []).some((o) => under(o));
  const isActive = (to: string) => {
    const item = allItems.find((i) => i.to === to);
    return item ? ownsPath(item) : under(to);
  };

  // ── 헤더 멀티탭 ──
  const matched = allItems.filter(ownsPath).sort((a, b) => b.to.length - a.to.length)[0];
  const activeHref = matched?.to ?? '/dashboard';

  const [openTabs, setOpenTabs] = useState<string[]>([activeHref]);
  useEffect(() => {
    setOpenTabs((prev) => (prev.includes(activeHref) ? prev : [...prev, activeHref]));
  }, [activeHref]);

  // AI 에이전트가 일하는 중이면 헤더 탭·메뉴에 진행 중 표시(다른 화면에 있어도)
  const aiBusy = useAiRunning(can('AI.USE')).length > 0;
  const editorTabs: EditorTab[] = openTabs
    .map((href) => {
      const it = allItems.find((i) => i.to === href);
      const busyAi = aiBusy && href === '/ai';
      return it
        ? {
            id: href,
            label: busyAi ? `${it.label} · 진행 중` : it.label,
            icon: busyAi ? (
              <Loader2 size={14} className={styles.spin} aria-label="진행 중" />
            ) : (
              <it.icon size={14} />
            ),
            closable: openTabs.length > 1,
          }
        : null;
    })
    .filter(Boolean) as EditorTab[];

  /**
   * 열어 둔 탭의 화면은 언마운트하지 않고 숨겨 둔다(브라우저 탭처럼) — 다시 누르면 다시 불러오지 않고 바로 보인다.
   * 탭마다 마지막으로 보던 경로·화면을 기억하고, 탭을 누르면 그 경로로 돌아간다. 탭을 닫으면 버린다.
   */
  const views = useRef(new Map<string, { pathname: string; path: string; element: ReactNode }>());
  views.current.set(activeHref, { pathname, path: pathname + search, element: outlet });
  for (const k of [...views.current.keys()]) {
    if (k !== activeHref && !openTabs.includes(k)) views.current.delete(k);
  }
  const goTab = (id: string) => navigate(views.current.get(id)?.path ?? id);

  const closeTab = (id: string) => {
    const next = openTabs.filter((t2) => t2 !== id);
    if (next.length === 0) return;
    setOpenTabs(next);
    views.current.delete(id);
    if (activeHref === id) goTab(next[next.length - 1]);
  };
  const addTab = () => {
    const closed = allItems.filter((i) => !openTabs.includes(i.to));
    if (closed.length === 0) return;
    setOpenTabs((prev) => [...prev, closed[0].to]);
    navigate(closed[0].to);
  };

  // ── 알림 벨 — 나와 관련된 일(결재 요청·결과, 업무 배정, 멘션, 담당 지정, 공지) ──
  const inbox = useInbox(!!user);
  const unread = inbox.unread;
  // 알림이 가리키는 화면을 열면(벨·대시보드·직접 이동 어느 쪽이든) 그 알림은 읽음
  useEffect(() => {
    const here = new URLSearchParams(search).get('detail');
    const seen = inbox.items.filter((n) => {
      if (n.readAt || !n.link) return false;
      const u = new URL(n.link, window.location.origin);
      if (u.pathname !== pathname) return false;
      const want = u.searchParams.get('detail');
      return want ? want === here : true;
    });
    if (seen.length) void inbox.markRead(seen.map((n) => n.id));
  }, [pathname, search, inbox.items, inbox.markRead]);
  const notis: NotificationBellItem[] = inbox.items.map((n) => ({
    id: n.id,
    title: n.title,
    message: [n.actorName, n.body].filter(Boolean).join(' · ') || undefined,
    timestamp: n.createdAt,
    read: !!n.readAt,
    type: INBOX_TYPE[n.kind] ?? 'info',
    onClick: () => {
      if (!n.readAt) void inbox.markRead([n.id]);
      if (n.link) navigate(n.link);
    },
  }));

  return (
    <div className={`${styles.desktopLayout} ${collapsed ? styles.collapsed : ''}`}>
      {/* 상단 풀폭 헤더 */}
      <header className={styles.topHeader}>
        <div className={styles.headerLeft} />
        <div className={styles.headerCenter}>
          <HeaderTabs
            tabs={editorTabs}
            activeId={activeHref}
            onTabChange={goTab}
            onTabClose={closeTab}
            onTabAdd={addTab}
            keepIconId={aiBusy ? '/ai' : undefined}
          />
        </div>
        <div className={styles.headerRight}>
          {aiBusy && (
            <button
              type="button"
              className={styles.aiChip}
              onClick={() => navigate('/ai')}
              title="AI 에이전트가 일하는 중입니다 — 눌러서 보기"
            >
              <Loader2 size={13} className={styles.spin} aria-hidden />
              AI 진행 중
            </button>
          )}
          <NotificationBell
            count={unread}
            notifications={notis}
            size="sm"
            emptyMessage={t('noti.empty')}
            onMarkAllRead={() => void inbox.markRead()}
            onClear={() => void inbox.clearRead()}
          />
          <ProfileMenu onEditMenu={() => setMenuEditOpen(true)} />
        </div>
      </header>

      {/* 메인: 고정 사이드바 + 콘텐츠 */}
      <div className={styles.mainArea}>
        <aside className={styles.sidebarWrap}>
          <LayoutSidebar
            collapsed={collapsed}
            onCollapse={() => setCol(true)}
            onExpand={() => setCol(false)}
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--ark-color-primary-500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  통
                </div>
                {!collapsed && <span style={{ fontWeight: 700, fontSize: 15 }}>통인 Works</span>}
              </div>
            }
          >
            {visibleGroups.map((g, gi) => (
              <SidebarGroup
                // 펼침 기본값은 처음 그릴 때만 먹는다 — 메뉴 구성이 바뀌면(계정 전환·편집) 다시 그린다
                key={`${gi}|${g.label ?? ''}|${g.defaultOpen === false ? 'c' : 'o'}|${g.items.length}`}
                label={collapsed ? undefined : g.label}
                collapsible={!collapsed}
                defaultOpen={g.defaultOpen !== false || g.items.some(ownsPath)}
              >
                {g.items.map((it) => (
                  <SidebarItem
                    key={it.to}
                    icon={
                      it.to === '/ai' && aiBusy ? (
                        <span className={styles.aiIcon}>
                          <it.icon size={16} />
                          <span className={styles.aiPulse} />
                        </span>
                      ) : (
                        <it.icon size={16} />
                      )
                    }
                    active={isActive(it.to)}
                    tooltip={
                      collapsed
                        ? it.to === '/ai' && aiBusy
                          ? `${it.label} · 진행 중`
                          : it.label
                        : undefined
                    }
                    onClick={() => navigate(it.to)}
                  >
                    {it.label}
                    {it.to === '/ai' && aiBusy && <span className={styles.aiBadge}>진행 중</span>}
                    {!!it.badge && <span className={styles.countBadge}>{it.badge}</span>}
                  </SidebarItem>
                ))}
              </SidebarGroup>
            ))}
          </LayoutSidebar>
          <MyMenuModal
            open={menuEditOpen}
            onOpenChange={setMenuEditOpen}
            menu={myMenu}
            visible={canSeeMenu}
          />
        </aside>

        <main className={styles.contentArea}>
          <div
            className={[
              styles.contentInner,
              pathname.startsWith('/calendar') ? styles.contentInnerTight : '',
              under('/ai') ? styles.contentInnerFlush : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* 화면마다 따로 — 한 화면이 깨져도 메뉴로 다른 화면에 갈 수 있게, 이동하면 풀린다 */}
            {[...views.current.entries()].map(([tab, v]) => {
              const active = tab === activeHref;
              return (
                <div
                  key={`${tab}|${v.pathname}`}
                  style={{ display: active ? 'contents' : 'none' }}
                  aria-hidden={!active || undefined}
                >
                  <ErrorBoundary>{active ? outlet : v.element}</ErrorBoundary>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
