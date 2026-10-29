import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  Banknote,
  Bot,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileSignature,
  Handshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  ListTodo,
  Megaphone,
  Package,
  PanelsTopLeft,
  Plane,
  Receipt,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  UserRound,
  Workflow,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MENU_LAYOUT,
  menuDef,
  type MenuDef,
  type MenuLayout,
  type PersonalMenuLayout,
} from '@tongin/shared';
import { api } from './api';

/** 카탈로그의 아이콘 이름 → 컴포넌트(카탈로그에 새 아이콘을 쓰면 여기 한 줄 추가) */
const ICONS: Record<string, LucideIcon> = {
  Award,
  Banknote,
  Bot,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileSignature,
  Handshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  ListTodo,
  Megaphone,
  Package,
  PanelsTopLeft,
  Plane,
  Receipt,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  UserRound,
  Workflow,
};
export const menuIcon = (m?: MenuDef): LucideIcon => (m && ICONS[m.icon]) || LayoutDashboard;

/** 메뉴 이름 — i18n에 있으면 그 언어로, 없으면 카탈로그 기본 이름 */
export function useMenuLabel() {
  const { t } = useTranslation();
  return useCallback(
    (key: string) => {
      const m = menuDef(key);
      if (!m) return key;
      return m.i18n ? t(`nav.${m.i18n}`, { defaultValue: m.label }) : m.label;
    },
    [t],
  );
}

export interface MyMenu {
  layout: MenuLayout;
  /** 편집용 배치 — 숨긴 메뉴도 제자리에 있다(예전 캐시엔 없을 수 있음) */
  editor?: MenuLayout;
  /** 관리자 구성(개인 설정 전) — 개인 편집에서 고를 수 있는 메뉴 */
  base: MenuLayout;
  hidden: string[];
  personalized: boolean;
  profiles: { id: string; name: string }[];
}

const CACHE_KEY = 'tongin_menu';
const EVENT = 'tongin:menu-changed';

function readCache(userId?: string): MyMenu | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { userId?: string; menu: MyMenu };
    return v.userId === userId ? v.menu : null;
  } catch {
    return null;
  }
}
function writeCache(userId: string | undefined, menu: MyMenu) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, menu }));
  } catch {
    /* 저장 못 해도 다음에 다시 받는다 */
  }
}

const FALLBACK: MyMenu = {
  layout: DEFAULT_MENU_LAYOUT,
  base: DEFAULT_MENU_LAYOUT,
  hidden: [],
  personalized: false,
  profiles: [],
};

/**
 * 내 사이드바 메뉴. 지난번 받은 것을 먼저 그리고(깜빡임 없이) 서버 값으로 바꾼다.
 * 받기 전·실패 시엔 전체 기본 메뉴(권한으로 걸러짐).
 */
export function useMyMenu(userId?: string) {
  const [menu, setMenu] = useState<MyMenu>(() => readCache(userId) ?? FALLBACK);
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const m = await api<MyMenu>('/menus/me');
      setMenu(m);
      writeCache(userId, m);
    } catch {
      /* 서버가 아직 메뉴 API를 모르면 기본 메뉴 그대로 */
    }
  }, [userId]);
  useEffect(() => {
    setMenu(readCache(userId) ?? FALLBACK);
    void load();
    const on = () => void load();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [userId, load]);
  return menu;
}

/** 메뉴 구성이 바뀌었다고 사이드바에 알린다(내 메뉴 저장·관리자 구성 저장 후) */
export const notifyMenuChanged = () => window.dispatchEvent(new Event(EVENT));

export async function saveMyMenu(layout: PersonalMenuLayout) {
  const m = await api<MyMenu>('/menus/me', { method: 'PUT', body: JSON.stringify(layout) });
  notifyMenuChanged();
  return m;
}
export async function resetMyMenu() {
  const m = await api<MyMenu>('/menus/me', { method: 'DELETE' });
  notifyMenuChanged();
  return m;
}
