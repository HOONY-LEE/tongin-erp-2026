import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleSlash,
  Clock,
  Download,
  File as FileIcon,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  PenLine,
  Plus,
  Search,
  Terminal,
  XCircle,
} from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { Button, Checkbox, Input } from '../ui';
import {
  toolLabel,
  type AiToolInfo,
  type ChatItem,
  type Decision,
  type PendingCall,
  type Recipient,
  type SmsPreview,
} from './types';
import styles from './ai.module.css';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;
type CodeItem = Extract<ChatItem, { kind: 'code' }>;
type FileItem = Extract<ChatItem, { kind: 'file' }>;

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

const CODE_STATUS: Record<CodeItem['status'], { label: string; icon: typeof Clock; cls: string }> =
  {
    RUNNING: { label: '실행 중', icon: Loader2, cls: styles.stPending },
    DONE: { label: '완료', icon: CheckCircle2, cls: styles.stDone },
    ERROR: { label: '실패', icon: XCircle, cls: styles.stError },
  };

/** 코드 실행 한 줄 — 눌러서 실행한 코드와 출력을 펼쳐 본다 */
export function CodeRow({ item }: { item: CodeItem }) {
  const st = CODE_STATUS[item.status] ?? CODE_STATUS.DONE;
  const StIcon = st.icon;
  const Icon = item.tool === 'bash' ? Terminal : FileCode2;
  return (
    <details className={styles.tool}>
      <summary className={styles.toolHead}>
        <Icon size={14} className={styles.toolIcon} aria-hidden />
        <span className={styles.toolName}>
          코드 실행
          {item.title && <span className={styles.codeTitle}> · {item.title}</span>}
        </span>
        <span className={[styles.toolStatus, st.cls].join(' ')}>
          <StIcon size={13} aria-hidden />
          {st.label}
        </span>
      </summary>
      <div className={styles.toolBody}>
        <div className={styles.toolLabel}>{item.tool === 'bash' ? '명령·코드' : '파일 내용'}</div>
        <pre className={styles.pre}>{item.code || '(내용 없음)'}</pre>
        {item.output !== undefined && (
          <>
            <div className={styles.toolLabel}>출력</div>
            <pre className={styles.pre}>{item.output || '(출력 없음)'}</pre>
          </>
        )}
      </div>
    </details>
  );
}

const fileKind = (name: string, mediaType: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['xlsx', 'xls', 'csv'].includes(ext) || mediaType.includes('spreadsheet'))
    return { icon: FileSpreadsheet, label: ext === 'csv' ? 'CSV' : '엑셀', cls: styles.fileXls };
  if (ext === 'pdf') return { icon: FileText, label: 'PDF', cls: styles.filePdf };
  if (mediaType.startsWith('image/'))
    return { icon: FileImage, label: '이미지', cls: styles.fileImg };
  return { icon: FileIcon, label: ext.toUpperCase() || '파일', cls: '' };
};

const fmtSize = (n: number) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1)}MB`
    : n >= 1024
      ? `${Math.round(n / 1024)}KB`
      : `${n}B`;

/** AI가 만든 파일 카드 — 종류 아이콘·이름·크기·다운로드 */
export function FileCard({ item }: { item: FileItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = fileKind(item.name, item.mediaType);
  const Icon = k.icon;
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(`/ai/files/${item.id}`, item.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : '다운로드에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.fileCard}>
      <span className={[styles.fileIcon, k.cls].join(' ')} aria-hidden>
        <Icon size={20} />
      </span>
      <span className={styles.fileInfo}>
        <span className={styles.fileName} title={item.name}>
          {item.name}
        </span>
        <span className={styles.sub}>
          {k.label} · {fmtSize(item.size)}
          {error && <span className={styles.fileError}> · {error}</span>}
        </span>
      </span>
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        leftIcon={<Download size={14} />}
        onClick={() => void download()}
        aria-label={`${item.name} 다운로드`}
      >
        다운로드
      </Button>
    </div>
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
  onDecide: (decisions: Decision[]) => void;
}) {
  const writes = pending.filter((p) => p.mode === 'WRITE');
  /** 문자 받는 사람 — 직원이 빼거나 더한 명단(도구 호출별) */
  const [lists, setLists] = useState<Record<string, Recipient[]>>(() =>
    Object.fromEntries(
      writes
        .filter((w) => isSms(w.preview))
        .map((w) => [w.toolUseId, (w.preview as SmsPreview).recipients]),
    ),
  );
  const editedIds = (w: PendingCall) => {
    const list = lists[w.toolUseId];
    if (!list || !isSms(w.preview)) return undefined;
    const orig = (w.preview as SmsPreview).recipients.map((r) => r.customerId).join();
    const now = list.map((r) => r.customerId);
    return now.join() === orig ? undefined : now;
  };
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(writes.map((w) => [w.toolUseId, true])),
  );
  const decide = (all?: boolean) =>
    onDecide(
      writes.map((w) => {
        const approve = all === undefined ? !!checked[w.toolUseId] : all;
        const customerIds = approve ? editedIds(w) : undefined;
        return { toolUseId: w.toolUseId, approve, ...(customerIds ? { customerIds } : {}) };
      }),
    );
  const multi = writes.length > 1;
  const selected = writes.filter((w) => checked[w.toolUseId]).length;
  // 받는 사람을 다 빼면 보낼 수 없다
  const emptySms = writes.some((w) => checked[w.toolUseId] && lists[w.toolUseId]?.length === 0);

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
                <RecipientEditor
                  // 예전 미리보기(고객 id 없음)는 고칠 수 없다 — 보기만
                  readOnly={!preview.recipients.every((r) => r.customerId)}
                  original={preview.recipients}
                  value={lists[w.toolUseId] ?? preview.recipients}
                  onChange={(v) => setLists((l) => ({ ...l, [w.toolUseId]: v }))}
                  disabled={busy}
                />
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
          disabled={(multi && selected === 0) || emptySms}
          onClick={() => decide(multi ? undefined : true)}
        >
          {multi ? `선택한 ${selected}건 실행` : '승인하고 실행'}
        </Button>
      </div>
    </div>
  );
}

/**
 * 문자 받는 사람 고치기 — AI가 고른 명단에서 빼고(체크 해제), 고객을 찾아 더한다.
 * 번호는 화면이 아니라 서버가 고객 원장에서 다시 꺼낸다(여기서는 고객만 고른다).
 */
function RecipientEditor({
  original,
  value,
  onChange,
  disabled,
  readOnly,
}: {
  original: Recipient[];
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Recipient[]>([]);
  // 처음 명단 + 더한 사람을 한 목록에 보여 주고, 체크로 넣고 뺀다
  const [shown, setShown] = useState<Recipient[]>(original);
  const on = new Set(value.map((r) => r.customerId));

  useEffect(() => {
    const kw = q.trim();
    if (kw.length < 1) {
      setFound([]);
      return;
    }
    const t = setTimeout(() => {
      api<Recipient[]>(`/ai/customers?q=${encodeURIComponent(kw)}`)
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (r: Recipient, checked: boolean) =>
    onChange(checked ? [...value, r] : value.filter((x) => x.customerId !== r.customerId));
  const add = (r: Recipient) => {
    if (!shown.some((x) => x.customerId === r.customerId)) setShown((s) => [...s, r]);
    if (!on.has(r.customerId)) onChange([...value, r]);
    setQ('');
    setFound([]);
  };
  const edited =
    value.length !== original.length ||
    value.some((r) => !original.some((o) => o.customerId === r.customerId));

  return (
    <div className={styles.recipientEditor}>
      <div className={styles.toolLabel}>
        받는 사람 {value.length}명{edited && <span className={styles.editedTag}> · 고침</span>}
        <span className={styles.sub}> — 체크를 풀면 빠집니다</span>
      </div>
      <ul className={styles.recipients}>
        {shown.map((r) => (
          <li key={r.customerId}>
            <Checkbox
              checked={on.has(r.customerId)}
              onCheckedChange={(v) => toggle(r, v === true)}
              label={r.name}
              description={r.phone}
              disabled={disabled || readOnly}
            />
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className={styles.addRow}>
          <Plus size={14} aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="받는 사람 더하기 — 이름·전화번호로 찾기"
            aria-label="받는 사람 찾기"
            disabled={disabled}
          />
        </div>
      )}
      {found.length > 0 && (
        <ul className={styles.found}>
          {found.map((r) => (
            <li key={r.customerId}>
              <button type="button" onClick={() => add(r)} disabled={on.has(r.customerId)}>
                <span>{r.name}</span>
                <span className={styles.sub}>{r.phone}</span>
                <span className={styles.sub}>{on.has(r.customerId) ? '이미 있음' : '더하기'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
