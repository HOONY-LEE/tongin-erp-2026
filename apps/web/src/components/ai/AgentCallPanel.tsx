import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleDot, Play, ShieldCheck, X } from 'lucide-react';
import {
  AGENT_RUN_STATUS_LABEL,
  AGENT_VISIBILITY_LABEL,
  type AgentVisibility,
  type InputField,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Badge, Button, useToast } from '../ui';
import { VISIBILITY_ICON } from '../agent/SharePicker';
import type { AgentRunView, TraceStep } from '../agent/RunPanel';
import { Markdown } from './Markdown';
import styles from './agentCall.module.css';

/** AI 에이전트 화면에서 부를 수 있는 에이전트(서버 /agents) */
export interface CallableAgent {
  id: string;
  name: string;
  description: string;
  visibility: AgentVisibility;
  isMine: boolean;
  ownerName: string | null;
  inputFields: InputField[];
  toolCount: number;
}

interface RunSummary {
  id: string;
  status: string;
  dryRun: boolean;
  error: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'info' | 'neutral'> = {
  DONE: 'success',
  ERROR: 'error',
  BLOCKED: 'error',
  REJECTED: 'neutral',
  AWAITING_APPROVAL: 'warning',
  RUNNING: 'info',
};
const STEP_ICON: Record<TraceStep['status'], typeof Check> = {
  ok: Check,
  dry: CircleDot,
  error: AlertTriangle,
  pending: ShieldCheck,
  blocked: AlertTriangle,
  skipped: X,
};

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const dt = (v: string) =>
  new Date(v).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * 만들어 둔 에이전트를 AI 에이전트 화면에서 부른다 — 입력값을 넣고 실행하면 단계별 진행과 결과가 보인다.
 * 데이터를 바꾸는 도구 앞에서는 멈추고 승인을 받는다. 도구는 부르는 사람 본인 권한으로 실행된다.
 */
export function AgentCallPanel({ agent, onClose }: { agent: CallableAgent; onClose: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(false);
  const [run, setRun] = useState<AgentRunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [openStep, setOpenStep] = useState<number | null>(null);

  const loadHistory = useCallback(() => {
    api<RunSummary[]>(`/agents/${agent.id}/runs`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [agent.id]);

  useEffect(() => {
    setValues({});
    setRun(null);
    loadHistory();
  }, [agent.id, loadHistory]);

  const fail = (e: unknown, fallback: string) =>
    toast({ type: 'error', title: e instanceof ApiError ? e.message : fallback });

  const start = async () => {
    const input: Record<string, unknown> = {};
    for (const f of agent.inputFields) {
      const raw = values[f.name]?.trim();
      if (!raw) {
        if (f.required) {
          toast({ type: 'warning', title: `'${f.description || f.name}'을(를) 입력해 주세요` });
          return;
        }
        continue;
      }
      if (f.type === 'number') input[f.name] = Number(raw);
      else if (f.type === 'boolean') input[f.name] = raw === 'true';
      else if (f.type === 'list' || f.type === 'object') {
        try {
          input[f.name] = JSON.parse(raw);
        } catch {
          input[f.name] = f.type === 'list' ? raw.split(',').map((x) => x.trim()) : raw;
        }
      } else input[f.name] = raw;
    }
    setBusy(true);
    setRun(null);
    try {
      setRun(
        await api<AgentRunView>(`/agents/${agent.id}/run`, {
          method: 'POST',
          body: JSON.stringify({ input, dryRun }),
        }),
      );
      loadHistory();
    } catch (e) {
      fail(e, '실행하지 못했습니다');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approve: boolean) => {
    if (!run) return;
    setBusy(true);
    try {
      setRun(
        await api<AgentRunView>(`/agents/runs/${run.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ approve }),
        }),
      );
      loadHistory();
    } catch (e) {
      fail(e, '처리하지 못했습니다');
    } finally {
      setBusy(false);
    }
  };

  const openRun = async (id: string) => {
    try {
      setRun(await api<AgentRunView>(`/agents/runs/${id}`));
    } catch (e) {
      fail(e, '불러오지 못했습니다');
    }
  };

  const VisIcon = VISIBILITY_ICON[agent.visibility] ?? VISIBILITY_ICON.PRIVATE;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2>{agent.name}</h2>
          {agent.description && <p>{agent.description}</p>}
          <span className={styles.meta}>
            <VisIcon size={12} aria-hidden /> {AGENT_VISIBILITY_LABEL[agent.visibility]} ·{' '}
            {agent.isMine ? '내가 만듦' : `${agent.ownerName ?? '알 수 없음'} 만듦`} · 도구{' '}
            {agent.toolCount}개
          </span>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>
      </div>

      <div className={styles.body}>
        <section className={styles.card}>
          <b className={styles.cardTitle}>입력</b>
          {agent.inputFields.length === 0 ? (
            <span className={styles.hint}>입력값 없이 바로 실행하는 에이전트입니다.</span>
          ) : (
            agent.inputFields.map((f) => (
              <label key={f.name} className={styles.field}>
                <span>
                  {f.description || f.name}
                  {f.required && <span className={styles.req}> *</span>}
                </span>
                {f.type === 'boolean' ? (
                  <select
                    className={styles.input}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  >
                    <option value="">선택 안 함</option>
                    <option value="true">예</option>
                    <option value="false">아니오</option>
                  </select>
                ) : (
                  <input
                    className={styles.input}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={values[f.name] ?? ''}
                    placeholder={
                      f.type === 'list' ? '쉼표로 나눠 입력' : f.type === 'object' ? 'JSON' : f.name
                    }
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
              </label>
            ))
          )}
          <label className={styles.check}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            시험 실행 — 데이터를 바꾸는 도구(문자 발송·등록 등)는 실제로 실행하지 않고 기록만
          </label>
          <div className={styles.actions}>
            <Button
              variant="primary"
              loading={busy && !run}
              leftIcon={<Play size={14} />}
              onClick={() => void start()}
              disabled={busy}
            >
              {busy && !run ? '실행하는 중…' : '실행'}
            </Button>
          </div>
        </section>

        {run && (
          <section className={styles.card}>
            <div className={styles.runHead}>
              <b className={styles.cardTitle}>실행 결과</b>
              <Badge variant="subtle" color={STATUS_COLOR[run.status] ?? 'neutral'}>
                {AGENT_RUN_STATUS_LABEL[run.status] ?? run.status}
              </Badge>
              {run.dryRun && (
                <Badge variant="subtle" color="info">
                  시험 실행
                </Badge>
              )}
            </div>

            {run.pending && (
              <div className={styles.approval}>
                <div className={styles.approvalTitle}>
                  <ShieldCheck size={16} /> 승인이 필요합니다
                </div>
                <p>{run.pending.message}</p>
                {run.pending.args !== undefined && (
                  <pre className={styles.pre}>{show(run.pending.args)}</pre>
                )}
                <div className={styles.actions}>
                  <Button variant="ghost" disabled={busy} onClick={() => void decide(false)}>
                    거절
                  </Button>
                  <Button variant="primary" loading={busy} onClick={() => void decide(true)}>
                    승인하고 계속
                  </Button>
                </div>
              </div>
            )}

            {run.error && (
              <div className={styles.error}>
                <AlertTriangle size={14} /> {run.error}
              </div>
            )}

            {typeof run.output === 'string' && run.output.trim() ? (
              <div className={styles.output}>
                <Markdown text={run.output} />
              </div>
            ) : run.output != null ? (
              <pre className={styles.pre}>{show(run.output)}</pre>
            ) : null}

            <details className={styles.steps}>
              <summary>진행 단계 {run.trace.length}개</summary>
              <ol>
                {run.trace.map((s) => {
                  const Icon = STEP_ICON[s.status] ?? CircleDot;
                  return (
                    <li key={s.seq} className={styles[`step_${s.status}`]}>
                      <button
                        type="button"
                        onClick={() => setOpenStep(openStep === s.seq ? null : s.seq)}
                      >
                        <Icon size={13} aria-hidden />
                        <span className={styles.stepLabel}>{s.label}</span>
                        <span className={styles.stepMsg}>{s.message}</span>
                      </button>
                      {openStep === s.seq && s.output !== undefined && (
                        <pre className={styles.pre}>{show(s.output)}</pre>
                      )}
                    </li>
                  );
                })}
              </ol>
            </details>
          </section>
        )}

        {history.length > 0 && (
          <section className={styles.card}>
            <b className={styles.cardTitle}>내 실행 기록</b>
            <div className={styles.history}>
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={`${styles.historyItem} ${run?.id === h.id ? styles.historyOn : ''}`}
                  onClick={() => void openRun(h.id)}
                >
                  <Badge variant="subtle" color={STATUS_COLOR[h.status] ?? 'neutral'} size="sm">
                    {AGENT_RUN_STATUS_LABEL[h.status] ?? h.status}
                  </Badge>
                  <span>{dt(h.createdAt)}</span>
                  {h.dryRun && <span className={styles.hint}>시험</span>}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
