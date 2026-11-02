import { useEffect, useState, type ReactNode } from 'react';
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
  Search,
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
  group: '개인' | '인사·결재' | '관리 화면';
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
  const [q, setQ] = useState('');

  const shortcuts = SHORTCUT_KEYS.map(menuDef).filter(
    (m): m is MenuDef => !!m && (!m.perm || can(m.perm)),
  );

  const sections: Section[] = [
    {
      id: 'general',
      label: '일반',
      icon: Palette,
      group: '개인',
      desc: '언어·테마·글자 크기 — 이 브라우저에 저장됩니다.',
      render: () => <GeneralSettings />,
    },
    {
      id: 'account',
      label: '내 계정',
      icon: UserRound,
      group: '개인',
      desc: '내 정보와 비밀번호',
      render: () => <AccountSettings />,
    },
    {
      id: 'menu',
      label: '내 메뉴',
      icon: SlidersHorizontal,
      group: '개인',
      desc: '받은 메뉴 안에서 순서·묶음·숨김을 내 마음대로',
      render: () => (
        <Row
          title="내 메뉴 편집"
          desc="사이드바 메뉴의 순서를 바꾸고, 묶음 이름을 고치고, 안 쓰는 메뉴를 숨깁니다."
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose();
              onEditMenu();
            }}
          >
            열기
          </Button>
        </Row>
      ),
    },
    ...(can('APPROVAL.MANAGE')
      ? ([
          {
            id: 'forms',
            label: '결재 양식',
            icon: FileText,
            group: '인사·결재',
            desc: '지출 결의·구매 품의처럼 회사에서 쓰는 신청서를 항목으로 만듭니다.',
            render: () => <FormsAdmin />,
          },
          {
            id: 'lines',
            label: '결재선',
            icon: GitBranch,
            group: '인사·결재',
            desc: '문서 종류 × 조직마다 기본 결재선을 정합니다.',
            render: () => <LineTemplates />,
          },
          {
            id: 'leave-form',
            label: '휴가 신청서',
            icon: ListChecks,
            group: '인사·결재',
            desc: '업무 대리인·사유 필수·추가 항목',
            render: () => <LeaveFormSettings />,
          },
        ] satisfies Section[])
      : []),
    ...(can('LEAVE.UPDATE')
      ? ([
          {
            id: 'leave-types',
            label: '휴가 종류',
            icon: CalendarCog,
            group: '인사·결재',
            desc: '연차·반차·반반차·경조사 등 — 단위와 연차 차감 여부',
            render: () => <LeaveTypes />,
          },
          {
            id: 'leave-grant',
            label: '연차 부여',
            icon: CalendarPlus,
            group: '인사·결재',
            desc: '직원·조직 단위로 연차를 더하거나 뺍니다.',
            render: () => <LeaveGrant />,
          },
        ] satisfies Section[])
      : []),
    ...(can('ATTENDANCE.UPDATE')
      ? ([
          {
            id: 'work-hours',
            label: '근무시간',
            icon: Clock,
            group: '인사·결재',
            desc: '출퇴근 기준 시각과 지각·조퇴 판정',
            render: () => <WorkHourSettings />,
          },
        ] satisfies Section[])
      : []),
    ...shortcuts.map(
      (m): Section => ({
        id: `go-${m.key}`,
        label: menuLabel(m.key),
        icon: menuIcon(m),
        group: '관리 화면',
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
              열기
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

  const groups = (['개인', '인사·결재', '관리 화면'] as const)
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
        aria-label="앱 설정"
        data-settings
      >
        <nav className={styles.nav}>
          <label className={styles.search}>
            <Search size={15} aria-hidden />
            <input
              className="no-focus-ring"
              value={q}
              placeholder="설정 찾기…"
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </label>
          {groups.map(({ g, items }) => (
            <div key={g} className={styles.navGroup}>
              <div className={styles.navLabel}>{g}</div>
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.navItem} ${s.id === current.id ? styles.navOn : ''}`}
                  onClick={() => setActive(s.id)}
                >
                  <s.icon size={16} aria-hidden />
                  <span>{s.label}</span>
                  {s.group === '관리 화면' && (
                    <ChevronRight size={14} className={styles.navGo} aria-hidden />
                  )}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className={styles.empty}>맞는 설정이 없습니다.</p>}
        </nav>
        <section className={styles.body}>
          <header className={styles.head}>
            <div>
              <h2>{current.label}</h2>
              {current.desc && <p>{current.desc}</p>}
            </div>
            <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
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
      <Row title={t('lang.label')} desc="화면에 쓰는 언어">
        <SegmentedControl
          size="sm"
          value={i18n.language}
          onChange={(v) => setLang(v)}
          options={SUPPORTED_LANGS.map((l) => ({ value: l.code, label: l.label }))}
        />
      </Row>
      <Row title={t('theme.label')} desc="시스템을 고르면 컴퓨터 설정(라이트/다크)을 따릅니다.">
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={(v) => setMode(v as ThemeMode)}
          options={THEMES.map((m) => ({ value: m, label: t(`theme.${m}`) }))}
        />
      </Row>
      <Row title={t('fontSize.label')} desc="화면 전체 글자 크기 — 중간이 기본입니다.">
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
