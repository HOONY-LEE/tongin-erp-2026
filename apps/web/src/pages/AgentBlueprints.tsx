import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  PageHeader,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';
import { VISIBILITY_ICON } from '../components/agent/SharePicker';
import styles from './agentBuilder.module.css';

type Filter = 'all' | 'mine' | 'shared';

const STATUS_MAP: StatusMap = {
  DRAFT: { label: '초안', color: 'neutral' },
  ACTIVE: { label: '사용중', color: 'success' },
};

const dt = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/**
 * AIX-04: Agent Builder — 블루프린트 목록(복제·삭제). 만들기는 /agent-builder/new, 편집은 /agent-builder/:id.
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

  const duplicate = async (r: Row) => {
    try {
      await api(`/agent-blueprints/${String(r.id)}/duplicate`, { method: 'POST' });
      toast({ type: 'success', title: '복제했습니다 — 내 개인용 초안으로 만들었습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '복제하지 못했습니다' });
    }
  };

  const remove = async (r: Row) => {
    if (
      !window.confirm(
        `'${String(r.name)}' 에이전트를 삭제할까요? 테스트 실행 기록도 함께 지워집니다.`,
      )
    )
      return;
    try {
      await api(`/agent-blueprints/${String(r.id)}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const shown = useMemo(
    () => rows.filter((r) => (filter === 'all' ? true : filter === 'mine' ? r.isMine : !r.isMine)),
    [rows, filter],
  );

  const columns: Column[] = [
    {
      title: '에이전트',
      dataIndex: 'name',
      flex: 1,
      minWidth: 240,
      render: (r) => (
        <div className={styles.nameCell}>
          <b>{String(r.name)}</b>
          {r.description ? <span>{String(r.description)}</span> : null}
        </div>
      ),
    },
    { title: '상태', render: (r) => <StatusBadge value={String(r.status)} map={STATUS_MAP} /> },
    {
      title: '공개 범위',
      render: (r) => {
        const v = String(r.visibility) as AgentVisibility;
        const Icon = VISIBILITY_ICON[v] ?? VISIBILITY_ICON.PRIVATE;
        return (
          <span className={styles.visBadge}>
            <Icon size={13} aria-hidden />
            {AGENT_VISIBILITY_LABEL[v] ?? v}
            {v === 'SHARED' ? ` ${Number(r.shareCount ?? 0)}명` : ''}
          </span>
        );
      },
    },
    {
      title: '만든 사람',
      render: (r) => (r.isMine ? '나' : String(r.createdByName ?? '-')),
    },
    {
      title: '시작',
      render: (r) => {
        const tr = r.trigger as TriggerConfig | null;
        if (!tr) return '-';
        const extra =
          tr.kind === 'schedule' ? ` ${tr.cron}` : tr.kind === 'event' ? ` ${tr.event}` : '';
        return `${TRIGGER_KIND_LABEL[tr.kind] ?? tr.kind}${extra}`;
      },
    },
    { title: '노드', numeric: true, render: (r) => `${Number(r.nodeCount ?? 0)}개` },
    { title: '도구', numeric: true, render: (r) => `${Number(r.toolCount ?? 0)}개` },
    { title: '테스트', numeric: true, render: (r) => `${Number(r.runCount ?? 0)}회` },
    { title: '수정', dataIndex: 'updatedAt', render: (r) => dt(r.updatedAt) },
    {
      title: '',
      width: 150,
      render: (r) => (
        <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => void duplicate(r)}>
            복제
          </Button>
          {Boolean(r.canEdit) && (
            <Button variant="ghost" size="sm" onClick={() => void remove(r)}>
              삭제
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.listPage}>
      <PageHeader
        title={t('nav.aiAgents')}
        subtitle="자연어로 말하거나 직접 노드를 이어, ERP 도구를 실제로 호출하는 AI 에이전트를 만듭니다. 사용중인 에이전트는 AI 에이전트 화면에서 불러 씁니다."
        onRefresh={load}
        updatedAt={updatedAt}
        footer={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'all', label: `전체 ${rows.length}` },
              { value: 'mine', label: `내 에이전트 ${rows.filter((r) => r.isMine).length}` },
              { value: 'shared', label: `공유받은 ${rows.filter((r) => !r.isMine).length}` },
            ]}
          />
        }
      />
      <DataTable
        columns={columns}
        rows={shown}
        loading={loading}
        onRowClick={(r) => navigate(`/agent-builder/${String(r.id)}`)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => navigate('/agent-builder/new')}>
            + 새 에이전트
          </Button>
        }
      />
    </div>
  );
}
