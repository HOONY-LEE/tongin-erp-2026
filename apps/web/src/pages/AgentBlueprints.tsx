import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AGENT_VISIBILITY_LABEL,
  TRIGGER_KIND_LABEL,
  type AgentVisibility,
  type TriggerConfig,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  ListPage,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';
import { VISIBILITY_ICON } from '../components/agent/SharePicker';
import styles from './agentBuilder.module.css';

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
  DRAFT: { label: '초안', color: 'neutral' },
  ACTIVE: { label: '사용중', color: 'success' },
};

const dt = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/** 시작 방식 — 표의 '시작' 칸과 카드 메타가 같이 쓴다 */
const triggerText = (r: Row) => {
  const tr = r.trigger as TriggerConfig | null;
  if (!tr) return '-';
  const extra = tr.kind === 'schedule' ? ` ${tr.cron}` : tr.kind === 'event' ? ` ${tr.event}` : '';
  return `${TRIGGER_KIND_LABEL[tr.kind] ?? tr.kind}${extra}`;
};

/** 공개 범위 배지 — 표의 '공개 범위' 칸과 카드 메타가 같이 쓴다 */
function VisibilityBadge({ row }: { row: Row }) {
  const v = String(row.visibility) as AgentVisibility;
  const Icon = VISIBILITY_ICON[v] ?? VISIBILITY_ICON.PRIVATE;
  return (
    <span className={styles.visBadge}>
      <Icon size={13} aria-hidden />
      {AGENT_VISIBILITY_LABEL[v] ?? v}
      {v === 'SHARED' ? ` ${Number(row.shareCount ?? 0)}명` : ''}
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

  const shown = useMemo(
    () => rows.filter((r) => (filter === 'all' ? true : filter === 'mine' ? r.isMine : !r.isMine)),
    [rows, filter],
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

  const columns: Column[] = [
    {
      title: '에이전트',
      dataIndex: 'name',
      minWidth: 180,
      render: (r) => <b className={styles.nameCell}>{String(r.name)}</b>,
    },
    // 설명은 이름 아래 둘째 줄 대신 자기 칸으로 — 한 칸에 한 줄
    {
      title: '설명',
      dataIndex: 'description',
      flex: 1,
      minWidth: 200,
      render: (r) => (r.description ? String(r.description) : '-'),
    },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS_MAP} /> },
    { title: '공개 범위', render: (r) => <VisibilityBadge row={r} /> },
    {
      title: '만든 사람',
      render: (r) => (r.isMine ? '나' : String(r.createdByName ?? '-')),
    },
    { title: '시작', render: triggerText },
    { title: '노드', numeric: true, render: (r) => `${Number(r.nodeCount ?? 0)}개` },
    { title: '도구', numeric: true, render: (r) => `${Number(r.toolCount ?? 0)}개` },
    { title: '테스트', numeric: true, render: (r) => `${Number(r.runCount ?? 0)}회` },
    { title: '수정', dataIndex: 'updatedAt', render: (r) => dt(r.updatedAt) },
  ];

  // 목록을 나누는 탭 — 검색창 바로 오른쪽에 붙는다
  const tabs = (
    <SegmentedControl
      value={filter}
      onChange={(v) => setFilter(v as Filter)}
      options={[
        { value: 'all', label: `전체 ${rows.length}` },
        { value: 'mine', label: `내 에이전트 ${rows.filter((r) => r.isMine).length}` },
        { value: 'shared', label: `공유받은 ${rows.filter((r) => !r.isMine).length}` },
      ]}
    />
  );

  // 툴바 오른쪽 끝 — 보기 전환 + 새 에이전트
  const actions = (
    <>
      <SegmentedControl
        className={styles.viewToggle}
        value={view}
        onChange={(v) => changeView(v as View)}
        aria-label="보기 방식"
        options={[
          {
            value: 'cards',
            label: (
              <span title="카드형" aria-label="카드형">
                <LayoutGrid size={15} aria-hidden />
              </span>
            ),
          },
          {
            value: 'table',
            label: (
              <span title="목록형" aria-label="목록형">
                <List size={15} aria-hidden />
              </span>
            ),
          },
        ]}
      />
      <Button variant="primary" size="sm" onClick={() => navigate('/agent-builder/new')}>
        + 새 에이전트
      </Button>
    </>
  );

  return (
    <ListPage
      title={t('nav.aiAgents')}
      subtitle="자연어로 말하거나 직접 노드를 이어, ERP 도구를 실제로 호출하는 AI 에이전트를 만듭니다. 사용중인 에이전트는 AI 에이전트 화면에서 불러 씁니다."
      onRefresh={load}
      updatedAt={updatedAt}
    >
      {view === 'table' ? (
        <DataTable
          columns={columns}
          rows={shown}
          loading={loading}
          onRowClick={open}
          filters={tabs}
          toolbarActions={actions}
        />
      ) : (
        <>
          {/* 표 툴바와 같은 모양 — DataTable 툴바 클래스(base.css)를 그대로 빌려 쓴다 */}
          <div className="dt-wrap">
            <div className="sft-toolbar">
              <div className="sft-toolbar__left">
                <div className="sft-toolbar__search-wrap">
                  <span className="sft-toolbar__search-icon" aria-hidden="true">
                    <Search size={15} />
                  </span>
                  <input
                    className="sft-toolbar__search"
                    type="search"
                    value={query}
                    placeholder="검색"
                    aria-label="에이전트 검색"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="sft-toolbar__right">
                <div className="dt-toolbar-filters">{tabs}</div>
                {actions}
              </div>
            </div>
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
              {rows.length === 0
                ? '아직 만든 에이전트가 없습니다. 「+ 새 에이전트」로 시작해 보세요.'
                : '조건에 맞는 에이전트가 없습니다.'}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {cards.map((r) => (
                <button
                  key={String(r.id)}
                  type="button"
                  className={styles.agentCard}
                  onClick={() => open(r)}
                >
                  <div className={styles.agentCardHead}>
                    <b className={styles.agentCardName}>{String(r.name)}</b>
                    <StatusBadge value={String(r.status)} map={STATUS_MAP} />
                  </div>
                  <p className={styles.agentCardDesc}>
                    {r.description ? String(r.description) : '설명 없음'}
                  </p>
                  <div className={styles.agentCardMeta}>
                    <span>{triggerText(r)}</span>
                    <VisibilityBadge row={r} />
                    <span className={styles.agentCardDate}>{dt(r.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </ListPage>
  );
}
