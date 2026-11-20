import { useEffect, useState, type ReactNode } from 'react';
import { SearchInput } from '../components/ui/SearchInput';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarCog,
  CalendarPlus,
  ChevronRight,
  Clock,
  FileText,
  GitBranch,
  ListChecks,
  Palette,
  SlidersHorizontal,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { menuDef, type MenuDef } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { FONT_SIZES, useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { SUPPORTED_LANGS, setLang } from '../i18n';
import { menuIcon, useMenuLabel } from '../lib/menu';
import { SegmentedControl, Button } from '../components/ui';
import { FormsAdmin } from '../components/approval/FormsAdmin';
import { LineTemplates } from '../components/approval/LineTemplates';
import { LeaveFormSettings, LeaveGrant, LeaveTypes } from '../pages/Leave';
import { SettingsTab as WorkHourSettings } from '../pages/Attendance';
import { AccountSettings } from './MyAccountModal';
import styles from './settings.module.css';

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'personal' | 'hr' | 'admin';
  /** 설명(오른쪽 위) */
  desc?: string;
  render: () => ReactNode;
}

/** 관리 화면 바로가기 — 화면이 커서 창 안에 넣지 않고 그 화면으로 보낸다 */
const SHORTCUT_KEYS = [
  'accounts',
  'menu-mgmt',
  'org-mgmt',
  'dashboard-admin',
  'hr',
  'product-mgmt',
  'partner-mgmt',
  'agent-builder',
  'ai-admin',
  'system-logs',
];

/**
 * 설정 — 옵시디언 설정 창처럼 왼쪽 목록 + 오른쪽 내용.
 * 개인 설정(언어·테마·글자 크기·내 계정·내 메뉴)과, 권한이 있으면 인사·결재 설정을 창 안에서 바로 고친다.
 * 큰 관리 화면(계정·권한, 메뉴 관리 …)은 '관리 화면'에서 열기 버튼으로 그 화면에 간다.
 */
export default function SettingsModal({
  onClose,
  onEditMenu,
}: {
  onClose: () => void;
  onEditMenu: () => void;
}) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const menuLabel = useMenuLabel();
  const { t } = useTranslation();
  const [q, setQ] = useState('');

  const shortcuts = SHORTCUT_KEYS.map(menuDef).filter(
    (m): m is MenuDef => !!m && (!m.perm || can(m.perm)),
  );

  const sections: Section[] = [
    {
      id: 'general',
      label: t('settings.s.general'),
      icon: Palette,
      group: 'personal',
      desc: t('settings.s.generalDesc'),
      render: () => <GeneralSettings />,
    },
    {
      id: 'account',
      label: t('settings.s.account'),
      icon: UserRound,
      group: 'personal',
      desc: t('settings.s.accountDesc'),
      render: () => <AccountSettings />,
    },
    {
      id: 'menu',
      label: t('settings.s.menu'),
      icon: SlidersHorizontal,
      group: 'personal',
      desc: t('settings.s.menuDesc'),
      render: () => (
        <Row title={t('settings.s.menuEdit')} desc={t('settings.s.menuEditDesc')}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose();
              onEditMenu();
            }}
          >
            {t('settings.open')}
          </Button>
        </Row>
      ),
    },
    ...(can('APPROVAL.MANAGE')
      ? ([
          {
            id: 'forms',
            label: t('settings.s.forms'),
            icon: FileText,
            group: 'hr',
            desc: t('settings.s.formsDesc'),
            render: () => <FormsAdmin />,
          },
          {
            id: 'lines',
            label: t('settings.s.lines'),
            icon: GitBranch,
            group: 'hr',
            desc: t('settings.s.linesDesc'),
            render: () => <LineTemplates />,
          },
          {
            id: 'leave-form',
            label: t('settings.s.leaveForm'),
            icon: ListChecks,
            group: 'hr',
            desc: t('settings.s.leaveFormDesc'),
            render: () => <LeaveFormSettings />,
          },
        ] satisfies Section[])
      : []),
    ...(can('LEAVE.UPDATE')
      ? ([
          {
            id: 'leave-types',
            label: t('settings.s.leaveTypes'),
            icon: CalendarCog,
            group: 'hr',
            desc: t('settings.s.leaveTypesDesc'),
            render: () => <LeaveTypes />,
          },
          {
            id: 'leave-grant',
            label: t('settings.s.leaveGrant'),
            icon: CalendarPlus,
            group: 'hr',
            desc: t('settings.s.leaveGrantDesc'),
            render: () => <LeaveGrant />,
          },
        ] satisfies Section[])
      : []),
    ...(can('ATTENDANCE.UPDATE')
      ? ([
          {
            id: 'work-hours',
            label: t('settings.s.workHours'),
            icon: Clock,
            group: 'hr',
            desc: t('settings.s.workHoursDesc'),
            render: () => <WorkHourSettings />,
          },
        ] satisfies Section[])
      : []),
    ...shortcuts.map(
      (m): Section => ({
        id: `go-${m.key}`,
        label: menuLabel(m.key),
        icon: menuIcon(m),
        group: 'admin',
        desc: m.desc,
        render: () => (
          <Row title={menuLabel(m.key)} desc={m.desc ?? ''}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                navigate(m.path);
              }}
            >
              {t('settings.open')}
            </Button>
          </Row>
        ),
      }),
    ),
  ];

  const [active, setActive] = useState(sections[0].id);
  const kw = q.trim();
  const shown = sections.filter((s) => !kw || s.label.includes(kw) || (s.desc ?? '').includes(kw));
  const current = sections.find((s) => s.id === active) ?? sections[0];

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // 안쪽 창(양식 편집 등)이 열려 있으면 그 창이 먼저 닫힌다
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]:not([data-settings])'))
        onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const groups = (['personal', 'hr', 'admin'] as const)
    .map((g) => ({ g, items: shown.filter((s) => s.group === g) }))
    .filter((x) => x.items.length > 0);

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        data-settings
      >
        <nav className={styles.nav}>
          <SearchInput value={q} onChange={setQ} placeholder={t('settings.find')} autoFocus />
          {groups.map(({ g, items }) => (
            <div key={g} className={styles.navGroup}>
              <div className={styles.navLabel}>{t(`settings.group.${g}`)}</div>
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.navItem} ${s.id === current.id ? styles.navOn : ''}`}
                  onClick={() => setActive(s.id)}
                >
                  <s.icon size={16} aria-hidden />
                  <span>{s.label}</span>
                  {s.group === 'admin' && (
                    <ChevronRight size={14} className={styles.navGo} aria-hidden />
                  )}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className={styles.empty}>{t('settings.none')}</p>}
        </nav>
        <section className={styles.body}>
          <header className={styles.head}>
            <div>
              <h2>{current.label}</h2>
              {current.desc && <p>{current.desc}</p>}
            </div>
            <button
              type="button"
              className={styles.close}
              aria-label={t('settings.close')}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>
          <div className={styles.content} key={current.id}>
            {current.render()}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

/** 옵시디언처럼 한 줄 — 왼쪽 제목·설명, 오른쪽 조작 */
function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <b>{title}</b>
        {desc && <span>{desc}</span>}
      </div>
      <div className={styles.rowCtl}>{children}</div>
    </div>
  );
}

const THEMES: ThemeMode[] = ['system', 'light', 'dark'];

function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const { mode, setMode, fontSize, setFontSize } = useTheme();
  return (
    <div className={styles.card}>
      <Row title={t('lang.label')} desc={t('settings.langDesc')}>
        <SegmentedControl
          size="sm"
          value={i18n.language}
          onChange={(v) => setLang(v)}
          options={SUPPORTED_LANGS.map((l) => ({ value: l.code, label: l.label }))}
        />
      </Row>
      <Row title={t('theme.label')} desc={t('settings.themeDesc')}>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={(v) => setMode(v as ThemeMode)}
          options={THEMES.map((m) => ({ value: m, label: t(`theme.${m}`) }))}
        />
      </Row>
      <Row title={t('fontSize.label')} desc={t('settings.fontDesc')}>
        <SegmentedControl
          size="sm"
          value={fontSize}
          onChange={(v) => setFontSize(v as (typeof FONT_SIZES)[number])}
          options={FONT_SIZES.map((f) => ({ value: f, label: t(`fontSize.${f}`) }))}
        />
      </Row>
    </div>
  );
}
