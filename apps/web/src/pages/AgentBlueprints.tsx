import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { Copy, LayoutGrid, List, MoreHorizontal, Power, PowerOff, Trash2 } from 'lucide-react';
import { Menu, type MenuEntry } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { type AgentVisibility, type TriggerConfig } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  ConfirmModal,
  DataTable,
  FilterButton,
  filterRows,
  ListPage,
  ListToolbar,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
  SearchInput,
} from '../components/ui';
import { VISIBILITY_ICON } from '../components/agent/SharePicker';
import { HabitSuggestions } from '../components/agent/HabitSuggestions';
import styles from './agentBuilder.module.css';
import { AGENT_VISIBILITY_LABEL, TRIGGER_KIND_LABEL } from '../i18n/codes';

type Filter = 'all' | 'mine' | 'shared';
type View = 'cards' | 'table';

/** 카드형/목록형 선택을 기억해 두는 키(브라우저별 편의 설정) */
const VIEW_KEY = 'agentBuilder.listView';

const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
};

const STATUS_MAP: StatusMap = {
  DRAFT: { label: i18n.t('ai.st.DRAFT'), color: 'neutral' },
  ACTIVE: { label: i18n.t('ai.st.ACTIVE'), color: 'success' },
};

const dt = (v: unknown) => fmtDateTime(v) || '-';

/** 시작 방식 — 표의 '시작' 칸과 카드 메타가 같이 쓴다 */
const triggerText = (r: Row) => {
  const tr = r.trigger as TriggerConfig | null;
  if (!tr) return '-';
  const extra = tr.kind === 'schedule' ? ` ${tr.cron}` : tr.kind === 'event' ? ` ${tr.event}` : '';
  return `${TRIGGER_KIND_LABEL[tr.kind] ?? tr.kind}${extra}`;
};

/** 공개 범위 배지 — 표의 '공개 범위' 칸과 카드 메타가 같이 쓴다 */
function VisibilityBadge({ row }: { row: Row }) {
  const { t } = useTranslation();
  const v = String(row.visibility) as AgentVisibility;
  const Icon = VISIBILITY_ICON[v] ?? VISIBILITY_ICON.PRIVATE;
  return (
    <span className={styles.visBadge}>
      <Icon size={13} aria-hidden />
      {AGENT_VISIBILITY_LABEL[v] ?? v}
      {v === 'SHARED' ? t('ai.nPeople', { v0: Number(row.shareCount ?? 0) }) : ''}
    </span>
  );
}

/**
 * AIX-04: Agent Builder — 블루프린트 목록(행을 누르면 편집 화면 — 복제·삭제는 그 머리글에). 만들기는 /agent-builder/new, 편집은 /agent-builder/:id.
 * 내가 만든 것 + 전체 공개 + 나에게 공유된 에이전트가 보인다. 고치기·지우기는 만든 사람만.
 */
export default function AgentBlueprints() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { updatedAt, touch } = useUpdatedAt();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  /** 검색 옆 필터 — 기간·상태·공개 범위·시작 방식 */
  const [flt, setFlt] = useState<FilterValues>({});
  const [view, setView] = useState<View>(readView);
  // 카드형 검색어(목록형은 표 자체 검색창을 쓴다)
  const [query, setQuery] = useState('');

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 모드 등)에선 이번 화면에서만 유지
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/agent-blueprints'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterFields: FilterField[] = useMemo(
    () => [
      {
        key: 'period',
        label: t('ai.flt.period'),
        type: 'date',
        options: [
          { value: 'updatedAt', label: t('ai.flt.updatedAt') },
          { value: 'createdAt', label: t('ai.flt.createdAt') },
        ],
      },
      {
        key: 'status',
        label: t('ai.flt.status'),
        type: 'multi',
        options: Object.entries(STATUS_MAP).map(([value, v]) => ({ value, label: v.label })),
      },
      {
        key: 'visibility',
        label: t('ai.flt.visibility'),
        type: 'multi',
        options: Object.entries(AGENT_VISIBILITY_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'trigger',
        label: t('ai.flt.trigger'),
        type: 'multi',
        options: Object.entries(TRIGGER_KIND_LABEL).map(([value, label]) => ({ value, label })),
      },
    ],
    [t],
  );
  // 필터를 먼저 걸고, 전체·내 것·공유받은 탭 숫자도 걸린 목록 기준으로
  const picked = useMemo(
    () =>
      filterRows(rows, filterFields, flt, (r, key) =>
        key === 'trigger' ? ((r.trigger as TriggerConfig | null)?.kind ?? '') : r[key],
      ),
    [rows, filterFields, flt],
  );
  const shown = useMemo(
    () =>
      picked.filter((r) => (filter === 'all' ? true : filter === 'mine' ? r.isMine : !r.isMine)),
    [picked, filter],
  );

  // 카드형 — 이름·설명으로 거른다
  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shown;
    return shown.filter((r) =>
      `${String(r.name ?? '')} ${String(r.description ?? '')}`.toLowerCase().includes(q),
    );
  }, [shown, query]);

  const open = (r: Row) => navigate(`/agent-builder/${String(r.id)}`);

  // ── 카드 점 3개 메뉴 — 복제(누구나) · 활성화/비활성화 · 삭제(만든 사람만)
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const duplicate = async (r: Row) => {
    try {
      await api(`/agent-blueprints/${String(r.id)}/duplicate`, { method: 'POST' });
      toast({ type: 'success', title: t('agent.duplicated') });
      void load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.dupFailed') });
    }
  };
  const setActive = async (r: Row, on: boolean) => {
    try {
      await api(`/agent-blueprints/${String(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: on ? 'ACTIVE' : 'DRAFT' }),
      });
      toast({ type: 'success', title: on ? t('agent.activated') : t('agent.deactivated') });
      void load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.saveFailed') });
    }
  };
  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/agent-blueprints/${String(toDelete.id)}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('agent.deleted') });
      setToDelete(null);
      void load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.deleteFailed') });
    } finally {
      setDeleting(false);
    }
  };
  const cardMenu = (r: Row): MenuEntry[] => {
    const active = r.status === 'ACTIVE';
    const items: MenuEntry[] = [
      { label: t('agent.duplicate'), icon: <Copy size={14} />, onClick: () => void duplicate(r) },
    ];
    if (r.canEdit) {
      items.push(
        active
          ? {
              label: t('ai.cardMenu.deactivate'),
              icon: <PowerOff size={14} />,
              onClick: () => void setActive(r, false),
            }
          : {
              label: t('ai.cardMenu.activate'),
              icon: <Power size={14} />,
              onClick: () => void setActive(r, true),
            },
        { type: 'separator' },
        {
          label: t('agent.delete'),
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => setToDelete(r),
        },
      );
    }
    return items;
  };

  const columns: Column[] = [
    {
      title: t('ai.agents'),
      dataIndex: 'name',
      minWidth: 180,
      render: (r) => <b className={styles.nameCell}>{String(r.name)}</b>,
    },
    // 설명은 이름 아래 둘째 줄 대신 자기 칸으로 — 한 칸에 한 줄
    {
      title: t('ai.desc'),
      dataIndex: 'description',
      flex: 1,
      minWidth: 200,
      render: (r) => (r.description ? String(r.description) : '-'),
    },
    {
      title: t('ai.status'),
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS_MAP} />,
    },
    { title: t('ai.visibility'), render: (r) => <VisibilityBadge row={r} /> },
    {
      title: t('ai.creator'),
      render: (r) => (r.isMine ? t('ai.me') : String(r.createdByName ?? '-')),
    },
    { title: t('ai.trigger'), render: triggerText },
    {
      title: t('ai.nodes'),
      numeric: true,
      render: (r) => t('ai.countN', { v0: Number(r.nodeCount ?? 0) }),
    },
    {
      title: t('ai.tools'),
      numeric: true,
      render: (r) => t('ai.countN', { v0: Number(r.toolCount ?? 0) }),
    },
    {
      title: t('ai.tests'),
      numeric: true,
      render: (r) => t('ai.timesN', { v0: Number(r.runCount ?? 0) }),
    },
    { title: t('ai.updated'), dataIndex: 'updatedAt', render: (r) => dt(r.updatedAt) },
  ];

  // 목록을 나누는 탭 — 툴바 셋째 줄 왼쪽
  const tabs = (
    <SegmentedControl
      value={filter}
      onChange={(v) => setFilter(v as Filter)}
      options={[
        { value: 'all', label: t('ai.allN', { v0: picked.length }) },
        { value: 'mine', label: t('ai.mineN', { v0: picked.filter((r) => r.isMine).length }) },
        {
          value: 'shared',
          label: t('ai.sharedN', { v0: picked.filter((r) => !r.isMine).length }),
        },
      ]}
    />
  );

  // 툴바 둘째 줄 오른쪽 — 카드형/목록형
  const viewSwitch = (
    <SegmentedControl
      className={styles.viewToggle}
      value={view}
      onChange={(v) => changeView(v as View)}
      aria-label={t('ai.viewMode')}
      options={[
        {
          value: 'cards',
          label: (
            <span title={t('ai.cards')} aria-label={t('ai.cards')}>
              <LayoutGrid size={15} aria-hidden />
            </span>
          ),
        },
        {
          value: 'table',
          label: (
            <span title={t('ai.list')} aria-label={t('ai.list')}>
              <List size={15} aria-hidden />
            </span>
          ),
        },
      ]}
    />
  );
  const filterButton = <FilterButton fields={filterFields} value={flt} onChange={setFlt} />;
  // 툴바 셋째 줄 오른쪽 — 새 에이전트
  const actions = (
    <Button variant="primary" size="sm" onClick={() => navigate('/agent-builder/new')}>
      {t('ai.newAgentBtn')}
    </Button>
  );

  return (
    <ListPage
      title={t('nav.aiAgents')}
      subtitle={t('ai.blueprintsSub')}
      onRefresh={load}
      updatedAt={updatedAt}
    >
      <HabitSuggestions />
      {view === 'table' ? (
        <DataTable
          columns={columns}
          rows={shown}
          loading={loading}
          onRowClick={open}
          tabs={tabs}
          filters={filterButton}
          viewSwitch={viewSwitch}
          toolbarActions={actions}
        />
      ) : (
        <>
          {/* 표 툴바와 같은 자리(ListToolbar) — 검색칸은 표 검색과 같은 모양(.dt-wrap 아래 softium 클래스) */}
          <div className="dt-wrap">
            <ListToolbar
              search={
                <SearchInput value={query} onChange={setQuery} ariaLabel={t('ai.searchAgents')} />
              }
              filters={filterButton}
              viewSwitch={viewSwitch}
              tabs={tabs}
              actions={actions}
            />
          </div>
          {loading && rows.length === 0 ? (
            <div className={styles.cardGrid} aria-busy>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`${styles.agentCard} ${styles.agentCardSkeleton}`}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="90%" height={12} />
                  <Skeleton width="40%" height={12} />
                </div>
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className={styles.cardEmpty}>
              {rows.length === 0 ? t('ai.noAgentsYet') : t('ai.noMatch')}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {cards.map((r) => (
                <div key={String(r.id)} className={styles.agentCardWrap}>
                  <button type="button" className={styles.agentCard} onClick={() => open(r)}>
                    <div className={styles.agentCardHead}>
                      <b className={styles.agentCardName}>{String(r.name)}</b>
                      <StatusBadge value={String(r.status)} map={STATUS_MAP} />
                    </div>
                    <p className={styles.agentCardDesc}>
                      {r.description ? String(r.description) : t('ai.noDesc')}
                    </p>
                    <div className={styles.agentCardMeta}>
                      <span>{triggerText(r)}</span>
                      <VisibilityBadge row={r} />
                      <span className={styles.agentCardDate}>{dt(r.updatedAt)}</span>
                    </div>
                  </button>
                  {/* 카드 오른쪽 위 점 3개 — 호버하면 보인다 */}
                  <span className={styles.agentCardMenu}>
                    <Menu
                      items={cardMenu(r)}
                      placement="bottom-end"
                      trigger={
                        <button
                          type="button"
                          className={styles.agentCardMenuBtn}
                          aria-label={t('ai.cardMenu.more')}
                          title={t('ai.cardMenu.more')}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      }
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <ConfirmModal
        open={!!toDelete}
        title={t('agent.delete')}
        message={toDelete ? t('agent.deleteQ', { v0: String(toDelete.name) }) : ''}
        confirmLabel={t('agent.delete')}
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </ListPage>
  );
}
