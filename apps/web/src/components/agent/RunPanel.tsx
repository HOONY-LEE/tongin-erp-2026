import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { type TriggerConfig } from '@tongin/shared';
import { Badge, Button } from '../ui';
import { FileCard } from '../ai/ChatParts';
import styles from '../../pages/agentBuilder.module.css';
import { fs } from '../../lib/fontScale';
import { AGENT_RUN_STATUS_LABEL } from '../../i18n/codes';

export interface TraceStep {
  seq: number;
  nodeId: string;
  nodeType: string;
  label: string;
  status: 'ok' | 'dry' | 'error' | 'pending' | 'blocked' | 'skipped';
  port?: string;
  input?: unknown;
  output?: unknown;
  message?: string;
  iteration?: number;
  durationMs: number;
  tokens?: { input: number; output: number };
}

export interface AgentRunView {
  id: string;
  status: string;
  dryRun: boolean;
  output: unknown;
  error: string | null;
  trace: TraceStep[];
  pending: {
    kind: string;
    nodeId: string;
    message: string;
    tool?: string;
    args?: unknown;
    /** 실제로 나갈 내용 미리보기(문자 받는 사람 목록 등) */
    preview?: unknown;
  } | null;
  /** 실행이 만든 파일(보고서 등) */
  files?: { id: string; toolUseId: string; name: string; mediaType: string; size: number }[];
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
const STEP_LABEL: Record<TraceStep['status'], string> = {
  ok: i18n.t('ai.run'),
  dry: i18n.t('ai.st.test'),
  error: i18n.t('ai.st.error'),
  pending: i18n.t('ai.st.waiting'),
  blocked: i18n.t('ai.st.blocked'),
  skipped: i18n.t('ai.st.skipped'),
};
const STEP_COLOR: Record<
  TraceStep['status'],
  'success' | 'error' | 'warning' | 'info' | 'neutral'
> = {
  ok: 'success',
  dry: 'info',
  error: 'error',
  pending: 'warning',
  blocked: 'error',
  skipped: 'neutral',
};

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

interface Props {
  trigger: TriggerConfig | null;
  run: AgentRunView | null;
  running: boolean;
  aiConfigured: boolean;
  onRun: (opts: { input: Record<string, unknown>; dryRun: boolean; mockLlm: boolean }) => void;
  onDecide: (approve: boolean) => void;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

/** 아래 테스트 실행 패널 — 입력값·옵션 | 단계별 추적(노드를 누르면 캔버스에서 선택) */
export function RunPanel({
  trigger,
  run,
  running,
  aiConfigured,
  onRun,
  onDecide,
  onSelectNode,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(true);
  const [mockLlm, setMockLlm] = useState(!aiConfigured);
  const [open, setOpen] = useState<number | null>(null);

  // 필수 입력값이 모두 채워져야 실행 버튼 활성
  const canSubmit = (trigger?.inputFields ?? []).every(
    (f) => !f.required || !!values[f.name]?.trim(),
  );

  const start = () => {
    const input: Record<string, unknown> = {};
    for (const f of trigger?.inputFields ?? []) {
      const raw = values[f.name];
      if (raw === undefined || raw === '') continue;
      if (f.type === 'number') input[f.name] = Number(raw);
      else if (f.type === 'boolean') input[f.name] = raw === 'true';
      else if (f.type === 'list' || f.type === 'object') {
        try {
          input[f.name] = JSON.parse(raw);
        } catch {
          input[f.name] = raw;
        }
      } else input[f.name] = raw;
    }
    onRun({ input, dryRun, mockLlm });
  };

  const tokens =
    run?.trace.reduce((n, s) => n + (s.tokens ? s.tokens.input + s.tokens.output : 0), 0) ?? 0;

  return (
    <div className={styles.runPanel}>
      <div className={styles.runForm}>
        <div className={styles.runHead}>
          <b>{t('ai.testRunTitle')}</b>
          <span className={styles.spacer} />
          <button type="button" className={styles.iconBtn} onClick={onClose} title={t('ai.close')}>
            <X size={13} />
          </button>
        </div>
        {(trigger?.inputFields ?? []).map((f) => (
          <label key={f.name} className={styles.label}>
            <span>
              {f.name}
              {f.required && <span className={styles.req}> *</span>} <small>({f.type})</small>
            </span>
            <input
              className={`${styles.input} ${f.type === 'object' || f.type === 'list' ? styles.mono : ''}`}
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              placeholder={f.description}
            />
          </label>
        ))}
        {!trigger?.inputFields.length && <div className={styles.note}>{t('ai.noInputsAgent')}</div>}
        <label className={styles.check}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          {t('ai.dryRunOpt')}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={mockLlm}
            disabled={!aiConfigured}
            onChange={(e) => setMockLlm(e.target.checked)}
          />
          {t('ai.skipAi')}
        </label>
        {!aiConfigured && <div className={styles.warnNote}>{t('ai.noKeyMock')}</div>}
        {!dryRun && (
          <div className={styles.warnNote}>
            {t('ai.realRun1')}
            {t('ai.realRun2')}
          </div>
        )}
        <Button
          variant="primary"
          size="sm"
          loading={running}
          leftIcon={<Play size={13} />}
          onClick={start}
          disabled={!canSubmit || running}
        >
          {dryRun ? t('ai.testRun') : t('ai.realRun')}
        </Button>
        <div className={styles.note}>{t('ai.readToolsNote')}</div>
      </div>

      <div className={styles.runResult}>
        {!run && !running && <div className={styles.note}>{t('ai.runHint')}</div>}
        {running && !run && <div className={styles.note}>{t('ai.runningDots')}</div>}
        {run && (
          <>
            <div className={styles.runHead}>
              <Badge variant="subtle" color={STATUS_COLOR[run.status] ?? 'neutral'}>
                {AGENT_RUN_STATUS_LABEL[run.status] ?? run.status}
              </Badge>
              <span className={styles.note}>
                {run.dryRun ? t('ai.testRun') : t('ai.realRun')} · {run.trace.length}
                {t('ai.stepsLabel')}
                {tokens ? t('ai.tokensN', { v0: tokens.toLocaleString() }) : ''}
              </span>
              {run.error && (
                <span className={styles.errDot} style={{ fontWeight: 400, fontSize: fs(12) }}>
                  {run.error}
                </span>
              )}
            </div>
            {run.pending && (
              <div className={styles.pendingBox}>
                <b>{t('ai.needApproval')}</b>
                <span>{run.pending.message}</span>
                {run.pending.args !== undefined && (
                  <pre className={styles.pre}>{show(run.pending.args)}</pre>
                )}
                {run.pending.preview !== undefined && (
                  <pre className={styles.pre}>{show(run.pending.preview)}</pre>
                )}
                <div className={styles.row}>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={running}
                    onClick={() => onDecide(true)}
                  >
                    {t('ai.approveContinue')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={running}
                    onClick={() => onDecide(false)}
                  >
                    {t('ai.reject')}
                  </Button>
                </div>
              </div>
            )}
            {run.output !== null && run.output !== undefined && (
              <div className={styles.outputBox}>{show(run.output)}</div>
            )}
            {run.files?.map((f) => (
              <FileCard
                key={f.id}
                item={{ ...f, kind: 'file' }}
                downloadPath={`/agent-runs/files/${f.id}`}
              />
            ))}
            <div>
              {run.trace.map((s) => (
                <div
                  key={s.seq}
                  className={`${styles.step} ${open === s.seq ? styles.stepOpen : ''}`}
                  onClick={() => {
                    setOpen(open === s.seq ? null : s.seq);
                    onSelectNode(s.nodeId);
                  }}
                >
                  <span className={styles.stepNo}>{s.seq}</span>
                  <span>
                    <Badge variant="subtle" size="sm" color={STEP_COLOR[s.status]}>
                      {STEP_LABEL[s.status]}
                    </Badge>
                  </span>
                  <span className={styles.stepMsg}>
                    <b>{s.label}</b>
                    {s.iteration !== undefined ? ` [#${s.iteration + 1}]` : ''}
                    {s.port ? ` → ${s.port}` : ''} {s.message ? `· ${s.message}` : ''}
                  </span>
                  <span className={styles.stepTime}>{s.durationMs}ms</span>
                  {open === s.seq && (
                    <>
                      {s.input !== undefined && (
                        <pre className={styles.pre}>
                          {t('ai.input')} {show(s.input)}
                        </pre>
                      )}
                      {s.output !== undefined && (
                        <pre className={styles.pre}>
                          {t('ai.output')} {show(s.output)}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
