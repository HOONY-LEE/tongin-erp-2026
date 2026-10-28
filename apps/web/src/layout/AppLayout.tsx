import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Loader2,
  Sparkles,
  LayoutDashboard,
  LayoutTemplate,
  Inbox,
  Banknote,
  LifeBuoy,
  Megaphone,
  Package,
  ShoppingCart,
  UserRound,
  Tag,
  Building2,
  Store,
  ShieldCheck,
  Handshake,
  CalendarDays,
  Globe,
  Monitor,
  Moon,
  Sun,
  LogOut,
  Calculator,
  Receipt,
  Award,
  Bot,
  Workflow,
} from 'lucide-react';
import {
  LayoutSidebar,
  SidebarGroup,
  SidebarItem,
  NotificationBell,
  type EditorTab,
  type NotificationBellItem,
} from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { SUPPORTED_LANGS, setLang } from '../i18n';
import { api } from '../lib/api';
import { useAiRunning } from '../lib/aiActivity';
import { ErrorBoundary } from '../components/ErrorBoundary';
import styles from './AppLayout.module.css';
import { HeaderTabs } from './HeaderTabs';
import { HeaderPicker } from './HeaderPicker';

const LANG_SHORT: Record<string, string> = { ko: '한', en: 'EN', zh: '中' };
const THEME_OPTIONS: { value: ThemeMode; icon: LucideIcon }[] = [
  { value: 'system', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
];

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: string;
  /** 자체 메뉴가 없는 하위 화면 경로 — 이 메뉴에 속한 것으로 보고 탭·선택표시를 유지한다.
   *  (예: 견적/계약/작업 상세는 접수 케이스의 문서라 '접수' 탭에 머물러야 한다) */
  owns?: string[];
};
/** defaultOpen=false면 처음엔 접어 둔다(그 그룹 화면에 있으면 펼친다) */
type NavGroup = { label?: string; items: NavItem[]; defaultOpen?: boolean };

const COLLAPSE_KEY = 'tongin_sidebar_collapsed';

interface NotiRow {
  id: string;
  eventType: string;
  message: string;
  sentAt: string;
}

export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const { mode, setMode } = useTheme();
  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === mode)?.icon ?? Monitor;
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

  const groups: NavGroup[] = [
    {
      label: t('navGroup.ops'),
      items: [
        { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, perm: 'STATS.READ' },
        { to: '/ai', label: t('nav.ai'), icon: Bot, perm: 'AI.USE' },
        {
          to: '/leads',
          label: t('nav.leads'),
          icon: Inbox,
          perm: 'LEAD.READ',
          // 견적·계약·작업 상세는 접수 케이스가 낳은 문서들이라 '접수' 탭 안에 머문다
          owns: ['/estimates', '/contracts', '/work-orders'],
        },
        {
          to: '/calendar',
          label: t('nav.calendar'),
          icon: CalendarDays,
          perm: 'WORK_ORDER.READ',
        },
        {
          to: '/payments-confirm',
          label: t('nav.paymentsConfirm'),
          icon: Banknote,
          perm: 'PAYMENT.READ',
        },
        // 현장(/field)은 폰·태블릿 전용 화면이라 PC 메뉴에 두지 않는다.
        // 현장 작업팀 계정은 로그인하면 자동으로 그 화면으로 간다(App.tsx 분기).
        // 리빙·케어(입주청소·정리수납 등 이사 외 서비스) 주문 — 이사 접수와 별도로 돌아가는 일정이라 메뉴로 둔다
        {
          to: '/service-orders',
          label: t('nav.serviceOrders'),
          icon: Sparkles,
          perm: 'SERVICE_ORDER.READ',
        },
        { to: '/support', label: t('nav.support'), icon: LifeBuoy, perm: 'SUPPORT.READ' },
        { to: '/campaigns', label: t('nav.campaigns'), icon: Megaphone, perm: 'MARKETING.READ' },
      ],
    },
    {
      label: t('navGroup.admin'),
      items: [
        { to: '/customers', label: t('nav.customers'), icon: UserRound, perm: 'CUSTOMER.READ' },
        {
          to: '/product-mgmt',
          label: t('nav.productMgmt'),
          icon: Tag,
          perm: 'PRODUCT.READ',
          owns: ['/products', '/cbm-items'],
        },
        { to: '/partner-mgmt', label: t('nav.partnerMgmt'), icon: Handshake, perm: 'PARTNER.READ' },
        {
          to: '/org-mgmt',
          label: t('nav.orgMgmt'),
          icon: Building2,
          perm: 'ORG_UNIT.READ',
          owns: ['/org-units'],
        },
        { to: '/branches', label: t('nav.branches'), icon: Store, perm: 'ORG_UNIT.READ' },
        { to: '/accounts', label: t('nav.accounts'), icon: ShieldCheck, perm: 'USER.READ' },
        { to: '/agent-builder', label: t('nav.aiAgents'), icon: Workflow, perm: 'AI.MANAGE' },
        {
          to: '/dashboard-admin',
          label: t('nav.dashboardAdmin'),
          icon: LayoutTemplate,
          perm: 'DASHBOARD.READ',
        },
      ],
    },
    {
      label: t('navGroup.finance'),
      // 본사는 자주 쓰지 않아 맨 아래에 접어 둔다. 지점장(정산 권한 없음)은 이 묶음에서
      // 자재/재고·가맹점발주만 보며 매일 쓰므로 펼쳐 둔다
      defaultOpen: !can('SETTLEMENT.READ'),
      items: [
        {
          to: '/settlements',
          label: t('nav.settlement'),
          icon: Calculator,
          perm: 'SETTLEMENT.READ',
        },
        { to: '/billing', label: t('nav.billing'), icon: Receipt, perm: 'BILLING.READ' },
        { to: '/hr', label: t('nav.hr'), icon: Award, perm: 'HR.READ' },
        // 자재·발주도 돈(원가·정산)과 묶여 정산 아래에 둔다
        { to: '/materials', label: t('nav.materials'), icon: Package, perm: 'MATERIAL.READ' },
        {
          to: '/material-orders',
          label: t('nav.materialOrders'),
          icon: ShoppingCart,
          perm: 'MATERIAL_ORDER.READ',
        },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || can(it.perm)) }))
    .filter((g) => g.items.length > 0);
  const allItems = visibleGroups.flatMap((g) => g.items);

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

  // ── 알림 벨 (notification 기록 표시) ──
  const [notis, setNotis] = useState<NotificationBellItem[]>([]);
  const loadNotis = useCallback(async () => {
    if (!can('NOTIFICATION.READ')) return;
    try {
      // 벨에는 최근 20건만 보인다 — 서버에서도 20건만 받는다
      const rows = await api<NotiRow[]>('/notifications?take=20');
      setNotis(
        rows.slice(0, 20).map((n) => ({
          id: n.id,
          title: n.eventType,
          message: n.message,
          timestamp: n.sentAt,
          read: false,
          type: 'info' as const,
        })),
      );
    } catch {
      /* 권한/네트워크 실패 시 무시 */
    }
  }, [can]);
  useEffect(() => {
    void loadNotis();
  }, [loadNotis]);
  const unread = notis.filter((n) => !n.read).length;

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
          <HeaderPicker
            title={t('lang.label')}
            value={i18n.language}
            options={SUPPORTED_LANGS.map((l) => ({ value: l.code, label: l.label }))}
            onChange={setLang}
            trigger={
              <>
                <Globe size={15} />
                {LANG_SHORT[i18n.language] ?? i18n.language.toUpperCase()}
              </>
            }
          />
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
          <HeaderPicker
            title={t('theme.label')}
            value={mode}
            options={THEME_OPTIONS.map((o) => ({
              value: o.value,
              label: t(`theme.${o.value}`),
              icon: <o.icon size={14} />,
            }))}
            onChange={(v) => setMode(v as ThemeMode)}
            trigger={<ThemeIcon size={15} />}
          />
          <NotificationBell
            count={unread}
            notifications={notis}
            size="sm"
            emptyMessage={t('noti.empty')}
            onMarkAllRead={() => setNotis((prev) => prev.map((n) => ({ ...n, read: true })))}
            onClear={() => setNotis([])}
          />
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
            footer={
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={logout}
                title={t('common.logout')}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: 'var(--ark-color-gray-200)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UserRound size={16} />
                </div>
                {!collapsed && (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.loginId}</div>
                      <div style={{ fontSize: 11, color: 'var(--ark-color-text-secondary)' }}>
                        {t('common.logout')}
                      </div>
                    </div>
                    <LogOut size={14} style={{ color: 'var(--ark-color-text-disabled)' }} />
                  </>
                )}
              </div>
            }
          >
            {visibleGroups.map((g, gi) => (
              <SidebarGroup
                key={g.label ?? `g${gi}`}
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
                  </SidebarItem>
                ))}
              </SidebarGroup>
            ))}
          </LayoutSidebar>
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
