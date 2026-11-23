import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Download, Loader2, Settings, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
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
import { SoftphoneBar } from '../components/SoftphoneBar';
import { MyMenuModal } from '../components/menu/MyMenuModal';
import { menuIcon, useMenuLabel, useMyMenu } from '../lib/menu';
import { useInbox } from '../lib/inbox';
import { MENU_CATALOG, PRODUCT_NAME, filterLayout, menuDef } from '@tongin/shared';
import styles from './AppLayout.module.css';
import { SidebarSearch, type SearchMenu } from './SidebarSearch';
import { HeaderTabs } from './HeaderTabs';
import { ProfileMenu } from './ProfileMenu';
import settingsStyles from './settings.module.css';
import { fs } from '../lib/fontScale';
import { isDesktop, isMacDesktop } from '../lib/desktop';
import { isPopoutWindow } from '../lib/popout';

// 설정 창은 누를 때만 읽는다(인사·결재 설정 화면까지 들어 있어 무겁다)
const SettingsModal = lazy(() => import('./SettingsModal'));
const DesktopDownloadModal = lazy(() =>
  import('../components/desktop/DesktopDownloadModal').then((m) => ({
    default: m.DesktopDownloadModal,
  })),
);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const canSeeMenu = (key: string) =>
    filterLayout({ groups: [{ label: '', items: [key] }] }, can, !!user?.employeeId).groups.length >
    0;
  const visibleGroups: NavGroup[] = filterLayout(myMenu.layout, can, !!user?.employeeId).groups.map(
    (g) => ({
      // 기본·시드 묶음 이름은 번역, 직접 만든 이름은 그대로
      label: t(`menuGroup.${g.label}`, { defaultValue: g.label }),
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
  const allItems: NavItem[] = [
    ...MENU_CATALOG.filter((m) => canSeeMenu(m.key)).map((m) => ({
      to: m.path,
      label: menuLabel(m.key),
      icon: menuIcon(m),
      owns: m.owns,
    })),
    // 메뉴에 없는 화면 — 헤더 프로필·직원 칩에서 들어간다(탭 이름만, 사이드바엔 안 보임)
    { to: '/profile', label: t('shell.profile'), icon: UserRound },
  ];

  // 메뉴 검색 — 권한 있는 전체 메뉴(사이드바에서 숨긴 것도). 설명·묶음 이름으로도 찾는다
  const searchItems: SearchMenu[] = MENU_CATALOG.filter((m) => canSeeMenu(m.key)).map((m) => ({
    to: m.path,
    label: menuLabel(m.key),
    desc: m.desc,
    group: m.category,
    icon: menuIcon(m),
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
            label: busyAi ? `${it.label} · ${t('shell.inProgress')}` : it.label,
            icon: busyAi ? (
              <Loader2 size={14} className={styles.spin} aria-label={t('shell.inProgress')} />
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

  // 화면 전체를 쓰는 작업 화면 — AI 비서 대화, 에이전트 만들기·편집(캔버스), 드라이브
  const flush =
    under('/ai') ||
    under('/drive') ||
    pathname.startsWith('/agent-builder/') ||
    // 위젯 스튜디오 — 왼쪽 설정·가운데 미리보기·오른쪽 AI, 콘텐츠 영역을 다 쓴다
    /^\/dashboard-admin\/widgets\/[^/]+/.test(pathname);

  // 새 창으로 띄운 작업 화면 — 사이드바·헤더 없이 화면만
  if (isPopoutWindow())
    return (
      <div className={styles.popout}>
        <div
          className={[styles.contentInner, flush ? styles.contentInnerFlush : '']
            .filter(Boolean)
            .join(' ')}
        >
          <ErrorBoundary key={pathname}>{outlet}</ErrorBoundary>
        </div>
      </div>
    );

  return (
    <div
      className={[
        styles.desktopLayout,
        collapsed ? styles.collapsed : '',
        isMacDesktop ? styles.native : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 상단 풀폭 헤더 */}
      <header className={styles.topHeader}>
        <div className={styles.headerLeft} />
        <div className={styles.headerCenter}>
          <HeaderTabs
            onReorder={(from, to, after) =>
              setOpenTabs((prev) => {
                const rest = prev.filter((t) => t !== from);
                const at = rest.indexOf(to);
                if (at < 0) return prev;
                rest.splice(after ? at + 1 : at, 0, from);
                return rest;
              })
            }
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
              title={t('shell.aiBusyTitle')}
            >
              <Loader2 size={13} className={styles.spin} aria-hidden />
              {t('shell.aiBusy')}
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
            footer={
              <div
                className={`${settingsStyles.sideFoot} ${collapsed ? settingsStyles.sideFootCollapsed : ''}`}
              >
                <button
                  type="button"
                  className={settingsStyles.gear}
                  title={t('shell.appSettings')}
                  aria-label={t('shell.appSettings')}
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings size={16} />
                  {!collapsed && <span>{t('shell.appSettings')}</span>}
                </button>
                {/* 웹에서만 — 데스크톱 앱 설치(이 컴퓨터 OS에 맞는 설치 파일) */}
                {!isDesktop && (
                  <button
                    type="button"
                    className={settingsStyles.footIcon}
                    title={t('shell.installApp')}
                    aria-label={t('shell.installApp')}
                    onClick={() => setDownloadOpen(true)}
                  >
                    <Download size={16} />
                  </button>
                )}
              </div>
            }
            header={
              // 머리 = 로고 줄(옆 탭 머리와 같은 높이) + 검색 — 메뉴 스크롤과 따로
              <div className={styles.sideHead}>
                <div className={styles.sideBrand}>
                  {/* 앱 아이콘(주황 바탕 흰 호랑이) + 통인웍스 */}
                  {collapsed ? (
                    // 접힌 사이드바 — 로고 자리에 펴기 '>' 버튼
                    <button
                      type="button"
                      className={styles.sideToggle}
                      title={t('shell.expandSidebar')}
                      aria-label={t('shell.expandSidebar')}
                      onClick={() => setCol(false)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    // 파비콘과 같은 앱 아이콘 — 주황 상자(24px)는 그대로, 안의 호랑이만 조금 작게
                    <span className={styles.brandIcon}>
                      <img
                        src="/apple-touch-icon.png"
                        alt={t('signin.brand')}
                        width={19}
                        height={19}
                      />
                    </span>
                  )}
                  {!collapsed && (
                    <span
                      aria-label={PRODUCT_NAME}
                      style={{
                        fontSize: fs(15),
                        fontWeight: 500,
                        letterSpacing: -0.1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('shell.brand')}
                    </span>
                  )}
                  {/* 사이드바 접기 — 머리 오른쪽 끝 '<' (접힌 상태에서는 로고를 누르면 편다) */}
                  {!collapsed && (
                    <button
                      type="button"
                      className={styles.sideToggle}
                      title={t('shell.collapseSidebar')}
                      aria-label={t('shell.collapseSidebar')}
                      onClick={() => setCol(true)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                  )}
                </div>
                <SidebarSearch
                  items={searchItems}
                  collapsed={collapsed}
                  onExpand={() => setCol(false)}
                  onOpen={(to) => navigate(to)}
                />
              </div>
            }
          >
            {visibleGroups.map((g, gi) => (
              <SidebarGroup
                // 펼침 기본값은 처음 그릴 때만 먹는다 — 메뉴 구성이 바뀌면(계정 전환·편집) 다시 그린다
                key={`${gi}|${g.label ?? ''}|${g.items.length}`}
                label={collapsed ? undefined : g.label}
                // 한국AI통신 콘솔처럼 묶음은 접지 않고 늘 펼친다(묶음 이름은 작은 회색 글자만)
                collapsible={false}
                defaultOpen
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
                          ? `${it.label} · ${t('shell.inProgress')}`
                          : it.label
                        : undefined
                    }
                    onClick={() => navigate(it.to)}
                  >
                    {it.label}
                    {it.to === '/ai' && aiBusy && (
                      <span className={styles.aiBadge}>{t('shell.inProgress')}</span>
                    )}
                    {!!it.badge && <span className={styles.countBadge}>{it.badge}</span>}
                  </SidebarItem>
                ))}
              </SidebarGroup>
            ))}
          </LayoutSidebar>
          {downloadOpen && (
            <Suspense fallback={null}>
              <DesktopDownloadModal onClose={() => setDownloadOpen(false)} />
            </Suspense>
          )}
          {settingsOpen && (
            <Suspense fallback={null}>
              <SettingsModal
                onClose={() => setSettingsOpen(false)}
                onEditMenu={() => setMenuEditOpen(true)}
              />
            </Suspense>
          )}
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
              flush ? styles.contentInnerFlush : '',
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
      {/* PC 전화 — 울림·통화 중 막대(어느 화면에서든). 새 창(팝아웃)에는 두지 않는다 */}
      <SoftphoneBar />
    </div>
  );
}
