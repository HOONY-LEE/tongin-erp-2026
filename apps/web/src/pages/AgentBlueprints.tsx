import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { TRIGGER_KIND_LABEL, type AgentGraph, type TriggerConfig } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Button,
  DataTable,
  Modal,
  PageHeader,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type Row,
  type StatusMap,
} from '../components/ui';
import styles from './agentBuilder.module.css';

const STATUS_MAP: StatusMap = {
  DRAFT: { label: '초안', color: 'neutral' },
  ACTIVE: { label: '사용중', color: 'success' },
};

const dt = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

const EXAMPLES = [
  '이번 주 미계약 고객에게 재안내 문자를 보내는 에이전트. 보내기 전에 꼭 내가 승인하게 해 줘',
  '어제 들어온 접수 중 담당자가 없는 건을 찾아 지점별로 요약해 줘',
  '미수금 상위 고객 10명을 찾아 담당자에게 확인 요청 문자를 보내는 에이전트(최대 10명)',
  '새 CS 티켓이 들어오면 AI가 긴급도를 분류해서 긴급이면 담당자 배정 전에 승인을 받아',
];

interface GenerateResult {
  name: string;
  description: string;
  graph: AgentGraph;
}

/** AIX-04: AI 에이전트 관리 — 블루프린트 목록(만들기·복제·삭제). 편집은 /ai-agents/:id */
export default function AgentBlueprints() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { updatedAt, touch } = useUpdatedAt();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'nl' | 'blank'>('nl');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        api<Row[]>('/agent-blueprints'),
        api<{ aiConfigured: boolean }>('/agent-blueprints/status'),
      ]);
      setRows(list);
      setAiConfigured(st.aiConfigured);
      if (!st.aiConfigured) setMode('blank');
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

  const create = async () => {
    setBusy(true);
    try {
      let body: Record<string, unknown> = { name: name.trim() || '새 에이전트' };
      if (mode === 'nl') {
        const g = await api<GenerateResult>('/agent-blueprints/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt: prompt.trim() }),
        });
        body = {
          name: name.trim() || g.name,
          description: g.description,
          graph: g.graph,
          prompt: prompt.trim(),
        };
      }
      const b = await api<{ id: string }>('/agent-blueprints', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreating(false);
      navigate(`/ai-agents/${b.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (r: Row) => {
    try {
      await api(`/agent-blueprints/${String(r.id)}/duplicate`, { method: 'POST' });
      toast({ type: 'success', title: '복제했습니다' });
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
          <Button variant="ghost" size="sm" onClick={() => void remove(r)}>
            삭제
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.listPage}>
      <PageHeader
        title={t('nav.aiAgents')}
        subtitle="자연어로 말하거나 직접 노드를 이어, ERP 도구를 실제로 호출하는 AI 에이전트를 만듭니다."
        onRefresh={load}
        updatedAt={updatedAt}
      />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => navigate(`/ai-agents/${String(r.id)}`)}
        toolbarActions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setName('');
              setPrompt('');
              setCreating(true);
            }}
          >
            + 새 에이전트
          </Button>
        }
      />

      <Modal
        open={creating}
        onOpenChange={(o) => !busy && setCreating(o)}
        title="새 에이전트"
        size="lg"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setCreating(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={mode === 'nl' && prompt.trim().length < 2}
              leftIcon={mode === 'nl' ? <Sparkles size={14} /> : undefined}
              onClick={() => void create()}
            >
              {mode === 'nl' ? (busy ? '설계하는 중…' : '자연어로 만들기') : '빈 캔버스로 시작'}
            </Button>
          </>
        }
      >
        <div className={styles.createBody}>
          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as 'nl' | 'blank')}
            options={[
              { value: 'nl', label: '자연어로 만들기', disabled: !aiConfigured },
              { value: 'blank', label: '직접 만들기' },
            ]}
          />
          <label className={styles.field}>
            이름 {mode === 'nl' && <span className={styles.note}>(비우면 AI가 지어 줍니다)</span>}
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 미계약 고객 재안내"
            />
          </label>
          {mode === 'nl' ? (
            <>
              <label className={styles.field}>
                어떤 일을 하는 에이전트인가요?
                <textarea
                  className={styles.textarea}
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="대상·조건·하는 일·승인이나 한도 같은 규칙을 말해 주세요."
                />
              </label>
              <div className={styles.examples}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className={styles.chip}
                    onClick={() => setPrompt(ex)}
                  >
                    {ex.length > 34 ? `${ex.slice(0, 33)}…` : ex}
                  </button>
                ))}
              </div>
              <div className={styles.note}>
                Claude가 실제로 호출할 수 있는 도구 목록(내 권한 기준)을 보고 노드·분기·가드레일을
                설계합니다. 데이터를 바꾸는 도구 앞에는 사람 승인을 자동으로 넣습니다. 만든 뒤
                캔버스에서 자세히 고칠 수 있습니다.
              </div>
            </>
          ) : (
            <div className={styles.note}>
              빈 캔버스에서 시작 노드·도구·분기·가드레일을 직접 끌어다 놓고 이어 만듭니다. 나중에
              자연어로 수정할 수도 있습니다.
            </div>
          )}
          {!aiConfigured && (
            <div className={styles.warnNote}>
              서버에 ANTHROPIC_API_KEY가 없어 자연어 생성·AI 판단 실행은 쓸 수 없습니다. 직접
              만들기는 그대로 됩니다.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
