// 사이드바 메뉴 카탈로그 + 메뉴 구성(레이아웃) — 화면·서버 공용.
//
// 메뉴가 보이는 조건은 두 겹이다.
//  1) 메뉴 구성에 들어 있어야 한다 — 관리자가 팀(조직)·권한 그룹·직책별로 '메뉴 구성'을 정의하고,
//     개인은 그 안에서 순서·묶음·숨김만 바꾼다.
//  2) 권한이 있어야 한다 — 구성에 있어도 권한이 없으면 안 보인다(구성은 '보여줄 것'이지 권한이 아니다).

/** 메뉴 한 개. key는 경로에서 앞 '/'를 뗀 것 */
export interface MenuDef {
  key: string;
  path: string;
  /** 기본 이름(한국어). 화면은 i18n `nav.<i18n>`이 있으면 그걸 쓴다 */
  label: string;
  i18n?: string;
  /** lucide-react 아이콘 이름 */
  icon: string;
  /** 이 권한이 있어야 보인다 */
  perm?: string;
  /** 권한 대신 '직원과 연결된 계정'이면 보인다(결재·휴가·근태 같은 본인 업무) */
  selfService?: boolean;
  /** 자체 메뉴가 없는 하위 화면 경로 — 이 메뉴의 탭·선택표시를 유지한다 */
  owns?: string[];
  /** 메뉴 고르기 화면에서 묶어 보여 줄 분류 */
  category: string;
  /** 한 줄 설명(메뉴 관리 화면) */
  desc?: string;
}

export const MENU_CATALOG: readonly MenuDef[] = [
  // 공통
  {
    key: 'dashboard',
    path: '/dashboard',
    label: '대시보드',
    i18n: 'dashboard',
    icon: 'LayoutDashboard',
    perm: 'STATS.READ',
    category: '공통',
    desc: '권한 그룹에 지정된 대시보드',
  },
  {
    key: 'ai',
    path: '/ai',
    label: 'AI 에이전트',
    i18n: 'ai',
    icon: 'Bot',
    perm: 'AI.USE',
    category: '공통',
    desc: 'AI에게 조회·작업 맡기기',
  },
  {
    key: 'notices',
    path: '/notices',
    label: '공지사항',
    i18n: 'notices',
    icon: 'Megaphone',
    perm: 'NOTICE.READ',
    selfService: true,
    category: '공통',
    desc: '전사·팀 공지',
  },
  {
    key: 'tasks',
    path: '/tasks',
    label: '팀 업무',
    i18n: 'tasks',
    icon: 'ListTodo',
    perm: 'TASK.READ',
    selfService: true,
    category: '공통',
    desc: '담당자별 업무·요청·진행 상황',
  },
  {
    key: 'approvals',
    path: '/approvals',
    label: '결재함',
    i18n: 'approvals',
    icon: 'FileSignature',
    selfService: true,
    category: '공통',
    desc: '전자결재',
  },
  {
    key: 'leave',
    path: '/leave',
    label: '휴가',
    i18n: 'leave',
    icon: 'Plane',
    perm: 'LEAVE.READ',
    selfService: true,
    category: '공통',
  },
  {
    key: 'attendance',
    path: '/attendance',
    label: '근태',
    i18n: 'attendance',
    icon: 'CalendarClock',
    perm: 'ATTENDANCE.READ',
    selfService: true,
    category: '공통',
  },
  // 이사·고객 운영
  {
    key: 'leads',
    path: '/leads',
    label: '접수',
    i18n: 'leads',
    icon: 'Inbox',
    perm: 'LEAD.READ',
    owns: ['/estimates', '/contracts', '/work-orders'],
    category: '운영',
    desc: '접수 → 견적 → 계약 → 작업',
  },
  {
    key: 'calendar',
    path: '/calendar',
    label: '캘린더',
    i18n: 'calendar',
    icon: 'CalendarDays',
    perm: 'WORK_ORDER.READ',
    category: '운영',
    desc: '이사·작업 일정',
  },
  {
    key: 'payments-confirm',
    path: '/payments-confirm',
    label: '입금확인',
    i18n: 'paymentsConfirm',
    icon: 'Banknote',
    perm: 'PAYMENT.READ',
    category: '운영',
  },
  {
    key: 'service-orders',
    path: '/service-orders',
    label: '리빙·케어',
    i18n: 'serviceOrders',
    icon: 'Sparkles',
    perm: 'SERVICE_ORDER.READ',
    category: '운영',
    desc: '입주청소·정리수납 등',
  },
  {
    key: 'support',
    path: '/support',
    label: '고객A/S',
    i18n: 'support',
    icon: 'LifeBuoy',
    perm: 'SUPPORT.READ',
    category: '운영',
    desc: 'CS상담·클레임·A/S',
  },
  {
    key: 'customers',
    path: '/customers',
    label: '고객관리',
    i18n: 'customers',
    icon: 'UserRound',
    perm: 'CUSTOMER.READ',
    category: '운영',
  },
  {
    key: 'campaigns',
    path: '/campaigns',
    label: '마케팅',
    i18n: 'campaigns',
    icon: 'Send',
    perm: 'MARKETING.READ',
    category: '운영',
    desc: '문자·알림톡 캠페인',
  },
  // 지점·가맹
  {
    key: 'branches',
    path: '/branches',
    label: '지점관리',
    i18n: 'branches',
    icon: 'Store',
    perm: 'ORG_UNIT.READ',
    category: '지점·가맹',
  },
  {
    key: 'branch-cases',
    path: '/branch-cases',
    label: '지점 관리 기록',
    i18n: 'branchCases',
    icon: 'ClipboardList',
    perm: 'BRANCH_CASE.READ',
    category: '지점·가맹',
    desc: '현장점검·불법영업·보험·소송·재계약',
  },
  {
    key: 'materials',
    path: '/materials',
    label: '자재/재고',
    i18n: 'materials',
    icon: 'Package',
    perm: 'MATERIAL.READ',
    category: '지점·가맹',
  },
  {
    key: 'material-orders',
    path: '/material-orders',
    label: '가맹점발주',
    i18n: 'materialOrders',
    icon: 'ShoppingCart',
    perm: 'MATERIAL_ORDER.READ',
    category: '지점·가맹',
  },
  // 정산·경영
  {
    key: 'settlements',
    path: '/settlements',
    label: '정산·미수금',
    i18n: 'settlement',
    icon: 'Calculator',
    perm: 'SETTLEMENT.READ',
    category: '정산·경영',
  },
  {
    key: 'billing',
    path: '/billing',
    label: '청구·마진',
    i18n: 'billing',
    icon: 'Receipt',
    perm: 'BILLING.READ',
    category: '정산·경영',
  },
  {
    key: 'hr',
    path: '/hr',
    label: '인사·성과',
    i18n: 'hr',
    icon: 'Award',
    perm: 'HR.READ',
    category: '정산·경영',
  },
  {
    key: 'assets',
    path: '/assets',
    label: '계약·자산 관리',
    i18n: 'assets',
    icon: 'Landmark',
    perm: 'ASSET.READ',
    category: '정산·경영',
    desc: '임대차·상표권·보험 등 만료일 관리',
  },
  // 기준정보·시스템
  {
    key: 'product-mgmt',
    path: '/product-mgmt',
    label: '상품관리',
    i18n: 'productMgmt',
    icon: 'Tag',
    perm: 'PRODUCT.READ',
    owns: ['/products', '/cbm-items'],
    category: '기준정보',
    desc: '상품·이사물품·공통코드',
  },
  {
    key: 'partner-mgmt',
    path: '/partner-mgmt',
    label: '거래처관리',
    i18n: 'partnerMgmt',
    icon: 'Handshake',
    perm: 'PARTNER.READ',
    category: '기준정보',
    desc: '전속업체·제휴사',
  },
  {
    key: 'org-mgmt',
    path: '/org-mgmt',
    label: '조직관리',
    i18n: 'orgMgmt',
    icon: 'Building2',
    perm: 'ORG_UNIT.READ',
    owns: ['/org-units'],
    category: '시스템',
  },
  {
    key: 'accounts',
    path: '/accounts',
    label: '계정·권한',
    i18n: 'accounts',
    icon: 'ShieldCheck',
    perm: 'USER.READ',
    category: '시스템',
  },
  {
    key: 'menu-mgmt',
    path: '/menu-mgmt',
    label: '메뉴 관리',
    i18n: 'menuMgmt',
    icon: 'PanelsTopLeft',
    perm: 'MENU.READ',
    category: '시스템',
    desc: '팀·권한 그룹별 사이드바 메뉴 구성',
  },
  {
    key: 'agent-builder',
    path: '/agent-builder',
    label: 'Agent Builder',
    i18n: 'aiAgents',
    icon: 'Workflow',
    perm: 'AI.MANAGE',
    category: '시스템',
  },
  {
    key: 'dashboard-admin',
    path: '/dashboard-admin',
    label: '대시보드 관리',
    i18n: 'dashboardAdmin',
    icon: 'LayoutTemplate',
    perm: 'DASHBOARD.READ',
    category: '시스템',
  },
];

export const MENU_CATEGORIES = [
  '공통',
  '운영',
  '지점·가맹',
  '정산·경영',
  '기준정보',
  '시스템',
] as const;

const BY_KEY = new Map(MENU_CATALOG.map((m) => [m.key, m]));
export const menuDef = (key: string): MenuDef | undefined => BY_KEY.get(key);

/** 메뉴 구성 — 묶음(제목 + 메뉴 key 순서) 목록 */
export interface MenuGroup {
  label: string;
  items: string[];
  /** 처음엔 접어 둔다(그 묶음 화면에 있으면 펼친다) */
  collapsed?: boolean;
}
export interface MenuLayout {
  groups: MenuGroup[];
}
/** 개인 설정 — 구성 + 숨긴 메뉴 */
export interface PersonalMenuLayout extends MenuLayout {
  hidden: string[];
}

/** 아무 구성도 걸리지 않을 때(그리고 슈퍼관리자) 쓰는 전체 메뉴 */
export const DEFAULT_MENU_LAYOUT: MenuLayout = {
  groups: [
    {
      label: '운영',
      items: [
        'dashboard',
        'ai',
        'leads',
        'calendar',
        'payments-confirm',
        'service-orders',
        'support',
        'campaigns',
      ],
    },
    { label: '내 업무', items: ['notices', 'tasks', 'approvals', 'leave', 'attendance'] },
    {
      label: '관리',
      items: [
        'customers',
        'product-mgmt',
        'partner-mgmt',
        'org-mgmt',
        'branches',
        'branch-cases',
        'accounts',
        'menu-mgmt',
        'agent-builder',
        'dashboard-admin',
      ],
    },
    {
      label: '정산',
      items: ['settlements', 'billing', 'hr', 'assets', 'materials', 'material-orders'],
      collapsed: true,
    },
  ],
};

/** 모르는 key·중복·빈 묶음 정리 */
export function normalizeLayout(layout: MenuLayout | null | undefined): MenuLayout {
  const seen = new Set<string>();
  const groups: MenuGroup[] = [];
  for (const g of layout?.groups ?? []) {
    const items = (g.items ?? []).filter((k) => BY_KEY.has(k) && !seen.has(k) && seen.add(k));
    const label =
      String(g.label ?? '')
        .trim()
        .slice(0, 30) || '메뉴';
    groups.push({ label, items, ...(g.collapsed ? { collapsed: true } : {}) });
  }
  return { groups };
}

export const layoutKeys = (l: MenuLayout): string[] => l.groups.flatMap((g) => g.items);

/**
 * 여러 구성을 하나로 — 앞(우선순위 높은) 구성의 묶음·순서를 따르고, 뒤 구성에만 있는 메뉴는
 * 같은 이름의 묶음 끝에(없으면 새 묶음으로) 붙인다.
 */
export function mergeLayouts(layouts: MenuLayout[]): MenuLayout {
  const out: MenuGroup[] = [];
  const seen = new Set<string>();
  for (const l of layouts) {
    for (const g of l.groups) {
      const fresh = g.items.filter((k) => !seen.has(k));
      if (!fresh.length) continue;
      fresh.forEach((k) => seen.add(k));
      const same = out.find((x) => x.label === g.label);
      if (same) same.items.push(...fresh);
      else out.push({ ...g, items: fresh });
    }
  }
  return { groups: out };
}

/**
 * 개인 설정을 기준 구성 위에 얹는다.
 * - 기준에 없는 메뉴는 개인 설정에 있어도 버린다(관리자가 뺀 메뉴).
 * - 개인이 숨긴 메뉴는 뺀다.
 * - 기준에 새로 생긴 메뉴(개인 설정 이후 관리자가 추가)는 기준 묶음 이름의 끝에 붙인다.
 */
export function applyPersonal(
  base: MenuLayout,
  personal: PersonalMenuLayout | null | undefined,
  /** 개인이 꺼내 쓸 수 있는 메뉴(기본 = 기준 구성의 메뉴). 슈퍼관리자는 카탈로그 전체 */
  allowedKeys?: string[],
): MenuLayout {
  if (!personal) return base;
  const allowed = new Set(allowedKeys ?? layoutKeys(base));
  const hidden = new Set(personal.hidden ?? []);
  const own = normalizeLayout({
    groups: personal.groups.map((g) => ({
      ...g,
      items: g.items.filter((k) => allowed.has(k) && !hidden.has(k)),
    })),
  });
  const placed = new Set([...layoutKeys(own), ...hidden]);
  const rest: MenuLayout = {
    groups: base.groups.map((g) => ({ ...g, items: g.items.filter((k) => !placed.has(k)) })),
  };
  // 개인 묶음은 비어 있어도 남긴다(사용자가 만든 빈 묶음) — 화면에서 빈 묶음은 그리지 않는다
  return {
    groups: mergeLayouts([own, rest]).groups.concat(own.groups.filter((g) => !g.items.length)),
  };
}

/** 권한으로 거른다 — can은 권한 코드 확인, isEmployee는 직원 연결 계정 여부 */
export function filterLayout(
  layout: MenuLayout,
  can: (perm: string) => boolean,
  isEmployee: boolean,
): MenuLayout {
  const visible = (k: string) => {
    const m = BY_KEY.get(k);
    if (!m) return false;
    if (m.selfService) return isEmployee || (!!m.perm && can(m.perm));
    return !m.perm || can(m.perm);
  };
  return {
    groups: layout.groups
      .map((g) => ({ ...g, items: g.items.filter(visible) }))
      .filter((g) => g.items.length > 0),
  };
}

/** 메뉴 구성의 적용 대상 종류 */
export type MenuTargetKind = 'ORG' | 'ROLE' | 'POSITION' | 'USER';
export const MENU_TARGET_LABEL: Record<MenuTargetKind, string> = {
  ORG: '소속',
  ROLE: '권한 그룹',
  POSITION: '직책',
  USER: '개인',
};
