import { useState } from 'react';
import { CheckCircle2, CircleSlash, Clock, PenLine, Search, XCircle } from 'lucide-react';
import { Button, Checkbox } from '../ui';
import {
  toolLabel,
  type AiToolInfo,
  type ChatItem,
  type PendingCall,
  type SmsPreview,
} from './types';
import styles from './ai.module.css';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

const STATUS_VIEW: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
  PENDING: { label: '승인 대기', icon: Clock, cls: styles.stPending },
  DONE: { label: '완료', icon: CheckCircle2, cls: styles.stDone },
  ERROR: { label: '실패', icon: XCircle, cls: styles.stError },
  REJECTED: { label: '거절됨', icon: CircleSlash, cls: styles.stRejected },
};

const pretty = (v: unknown) => {
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  return JSON.stringify(v, null, 2);
};

/** AI가 실행한 도구 한 줄 — 눌러서 입력·결과를 펼쳐 본다 */
export function ToolRow({ item, tools }: { item: ToolItem; tools: Map<string, AiToolInfo> }) {
  const write = tools.get(item.name)?.mode === 'WRITE' || item.name === 'send_sms';
  const st = STATUS_VIEW[item.status] ?? STATUS_VIEW.DONE;
  const Icon = write ? PenLine : Search;
  const StIcon = st.icon;
  return (
    <details className={styles.tool}>
      <summary className={styles.toolHead}>
        <Icon size={14} className={styles.toolIcon} aria-hidden />
        <span className={styles.toolName}>{toolLabel(item.name, tools)}</span>
        <span className={[styles.toolStatus, st.cls].join(' ')}>
          <StIcon size={13} aria-hidden />
          {st.label}
        </span>
      </summary>
      <div className={styles.toolBody}>
        <div className={styles.toolLabel}>입력 · {item.name}</div>
        <pre className={styles.pre}>{pretty(item.input)}</pre>
        {item.result !== undefined && (
          <>
            <div className={styles.toolLabel}>결과</div>
            <pre className={styles.pre}>{pretty(item.result)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

const isSms = (p: unknown): p is SmsPreview =>
  !!p && typeof p === 'object' && Array.isArray((p as SmsPreview).recipients);

/** {고객명} 자리를 강조해서 보여 준다 */
function MessagePreview({ text }: { text: string }) {
  const parts = text.split('{고객명}');
  return (
    <div className={styles.smsBubble}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <mark className={styles.token}>고객명</mark>}
          {p}
        </span>
      ))}
    </div>
  );
}

/**
 * 승인 카드 — AI가 쓰기 도구(등록·수정·발송)를 부르면 실행 전에 여기서 멈춘다.
 * 여러 건이면 건별로 고를 수 있고, 체크 해제한 건은 거절로 전달된다.
 */
export function ApprovalCard({
  pending,
  tools,
  busy,
  onDecide,
}: {
  pending: PendingCall[];
  tools: Map<string, AiToolInfo>;
  busy: boolean;
  onDecide: (decisions: { toolUseId: string; approve: boolean }[]) => void;
}) {
  const writes = pending.filter((p) => p.mode === 'WRITE');
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(writes.map((w) => [w.toolUseId, true])),
  );
  const decide = (all?: boolean) =>
    onDecide(
      writes.map((w) => ({
        toolUseId: w.toolUseId,
        approve: all === undefined ? !!checked[w.toolUseId] : all,
      })),
    );
  const multi = writes.length > 1;
  const selected = writes.filter((w) => checked[w.toolUseId]).length;

  return (
    <div className={styles.approval} role="region" aria-label="승인이 필요한 작업">
      <div className={styles.approvalTitle}>
        <PenLine size={16} aria-hidden /> 실행 전에 확인해 주세요
      </div>
      <div className={styles.approvalSub}>
        AI가 아래 작업을 하려고 합니다. 승인하면 바로 실행됩니다.
      </div>

      {writes.map((w) => {
        const preview = w.preview;
        return (
          <div key={w.toolUseId} className={styles.approvalItem}>
            <div className={styles.approvalHead}>
              {multi && (
                <Checkbox
                  checked={!!checked[w.toolUseId]}
                  onCheckedChange={(v) => setChecked((c) => ({ ...c, [w.toolUseId]: v === true }))}
                  aria-label={`${toolLabel(w.name, tools)} 선택`}
                />
              )}
              <span className={styles.approvalName}>{toolLabel(w.name, tools)}</span>
              <span className={styles.sub}>{w.summary}</span>
            </div>

            {isSms(preview) ? (
              <div className={styles.smsPreview}>
                <MessagePreview text={preview.message} />
                <div className={styles.toolLabel}>받는 사람 {preview.recipients.length}명</div>
                <ul className={styles.recipients}>
                  {preview.recipients.map((r, i) => (
                    <li key={i}>
                      <span>{r.name}</span>
                      <span className={styles.sub}>{r.phone}</span>
                    </li>
                  ))}
                </ul>
                {preview.skipped.length > 0 && (
                  <div className={styles.sub}>제외: {preview.skipped.join(', ')}</div>
                )}
              </div>
            ) : (
              <pre className={styles.pre}>
                {preview && typeof preview === 'object' && 'error' in preview
                  ? String((preview as { error: string }).error)
                  : pretty(w.input)}
              </pre>
            )}
          </div>
        );
      })}

      <div className={styles.approvalActions}>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => decide(false)}>
          {multi ? '모두 거절' : '거절'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={multi && selected === 0}
          onClick={() => decide(multi ? undefined : true)}
        >
          {multi ? `선택한 ${selected}건 실행` : '승인하고 실행'}
        </Button>
      </div>
    </div>
  );
}
