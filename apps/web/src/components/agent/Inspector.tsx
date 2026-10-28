import { useRef, useState, type ReactNode } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { SegmentedControl } from '@sunghoon_lee/akron-ui';
import {
  AGENT_MODELS,
  AGENT_NODE_DESC,
  AGENT_NODE_LABEL,
  FIELD_TYPES,
  GUARDRAIL_KINDS,
  GUARDRAIL_LABEL,
  TRIGGER_EVENTS,
  TRIGGER_EVENT_FIELDS,
  TRIGGER_EVENT_LABEL,
  TRIGGER_KINDS,
  TRIGGER_KIND_LABEL,
  type AgentIssue,
  type AgentNode,
  type AgentToolInfo,
  type AgentVar,
  type ApprovalConfig,
  type BranchCase,
  type BranchConfig,
  type GuardrailConfig,
  type GuardrailKind,
  type GuardrailRule,
  type LlmConfig,
  type LoopConfig,
  type OutputConfig,
  type ToolConfig,
  type TriggerConfig,
} from '@tongin/shared';
import { Modal } from '../ui';
import { TemplateInput, VarChips } from './TemplateInput';
import { ModeBadge, SchemaPreview, ToolExplorer } from './ToolExplorer';
import { NODE_COLOR } from './meta';
import styles from '../../pages/agentBuilder.module.css';

interface Props {
  node: AgentNode;
  vars: AgentVar[];
  tools: AgentToolInfo[];
  toolMap: Map<string, AgentToolInfo>;
  issues: AgentIssue[];
  onChange: (node: AgentNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** 이 에이전트의 참고 양식 — 양식으로 파일 만들기 노드에서 고른다 */
  references?: ReferenceOpt[];
  /** 참고 양식 올리기 — 올린 양식을 돌려준다 */
  onUploadReference?: (file: File) => Promise<ReferenceOpt | null>;
}

export interface ReferenceOpt {
  id: string;
  name: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CRON_PRESETS = [
  { cron: '0 9 * * 1', label: '매주 월 9시' },
  { cron: '0 9 * * *', label: '매일 9시' },
  { cron: '0 18 * * 1-5', label: '평일 18시' },
  { cron: '0 8 1 * *', label: '매월 1일 8시' },
];

function Label({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <label className={styles.label}>
      <span>{title}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** 오른쪽 속성 패널 — 고른 노드의 설정을 자세히 고친다 */
export function Inspector({
  node,
  vars,
  tools,
  toolMap,
  issues,
  onChange,
  onDelete,
  onDuplicate,
  references,
  onUploadReference,
}: Props) {
  const set = <K extends keyof AgentNode>(k: K, v: AgentNode[K]) => onChange({ ...node, [k]: v });
  const cfg = <T,>() => node.config as T;
  const patch = (p: Record<string, unknown>) =>
    onChange({ ...node, config: { ...node.config, ...p } as never });

  return (
    <div className={styles.inspector}>
      <div className={styles.inspHead}>
        <span className={styles.inspType} style={{ background: NODE_COLOR[node.type] }}>
          {AGENT_NODE_LABEL[node.type]}
        </span>
        <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.label}
        </b>
        <button type="button" className={styles.iconBtn} title="복제" onClick={onDuplicate}>
          <Copy size={13} />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.dangerBtn}`}
          title="삭제(Delete)"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className={styles.note}>{AGENT_NODE_DESC[node.type]}</div>

      {issues.length > 0 && (
        <div className={styles.box}>
          {issues.map((i, k) => (
            <div
              key={k}
              className={i.level === 'error' ? styles.errDot : styles.warnDot}
              style={{ fontWeight: 400, fontSize: 12 }}
            >
              {i.level === 'error' ? '오류' : '경고'} · {i.message}
            </div>
          ))}
        </div>
      )}

      <Label title="이름">
        <input
          className={styles.input}
          value={node.label}
          onChange={(e) => set('label', e.target.value)}
        />
      </Label>
      <div className={styles.note} style={{ marginTop: -6 }}>
        id <code>{node.id}</code>
      </div>

      {node.type === 'trigger' && <TriggerFields c={cfg<TriggerConfig>()} patch={patch} />}
      {node.type === 'llm' && <LlmFields c={cfg<LlmConfig>()} patch={patch} vars={vars} />}
      {node.type === 'tool' && (
        <ToolFields
          c={cfg<ToolConfig>()}
          patch={patch}
          vars={vars}
          tools={tools}
          toolMap={toolMap}
          references={references ?? []}
          onUploadReference={onUploadReference}
        />
      )}
      {node.type === 'branch' && <BranchFields c={cfg<BranchConfig>()} patch={patch} vars={vars} />}
      {node.type === 'loop' && <LoopFields c={cfg<LoopConfig>()} patch={patch} vars={vars} />}
      {node.type === 'guardrail' && (
        <GuardrailFields c={cfg<GuardrailConfig>()} patch={patch} tools={tools} />
      )}
      {node.type === 'approval' && (
        <Label
          title="승인 요청 문구"
          hint="실제 실행에서는 여기서 멈추고 승인·거절을 기다립니다. 테스트 실행은 승인으로 가정합니다."
        >
          <TemplateInput
            multiline
            value={cfg<ApprovalConfig>().message}
            onChange={(v) => patch({ message: v })}
            vars={vars}
          />
        </Label>
      )}
      {node.type === 'output' && (
        <>
          <Label
            title="최종 응답"
            hint="{{변수}}로 결과를 끼워 넣습니다. 반복 안에 두면 항목마다 덮어씁니다."
          >
            <TemplateInput
              multiline
              rows={5}
              value={cfg<OutputConfig>().template}
              onChange={(v) => patch({ template: v })}
              vars={vars}
            />
          </Label>
          <VarChips
            vars={vars}
            onPick={(n) => patch({ template: `${cfg<OutputConfig>().template}{{${n}}}` })}
          />
        </>
      )}
    </div>
  );
}

type Patch = (p: Record<string, unknown>) => void;

function TriggerFields({ c, patch }: { c: TriggerConfig; patch: Patch }) {
  const setField = (i: number, p: Partial<TriggerConfig['inputFields'][number]>) =>
    patch({ inputFields: c.inputFields.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  return (
    <>
      <Label title="시작 방식">
        <select
          className={styles.select}
          value={c.kind}
          onChange={(e) => patch({ kind: e.target.value })}
        >
          {TRIGGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {TRIGGER_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Label>
      {c.kind === 'schedule' && (
        <Label title="크론식" hint="분 시 일 월 요일 (한국 시간)">
          <input
            className={`${styles.input} ${styles.mono}`}
            value={c.cron}
            onChange={(e) => patch({ cron: e.target.value })}
          />
          <div className={styles.examples}>
            {CRON_PRESETS.map((p) => (
              <button
                key={p.cron}
                type="button"
                className={styles.chip}
                onClick={() => patch({ cron: p.cron })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <small>
            '사용중'으로 바꾸면 이 시간마다 만든 사람 권한으로 자동 실행됩니다. 데이터를 바꾸는
            단계는 실행 기록에서 승인해야 이어집니다.
          </small>
        </Label>
      )}
      {c.kind === 'event' && (
        <Label title="이벤트">
          <select
            className={styles.select}
            value={c.event}
            onChange={(e) => patch({ event: e.target.value })}
          >
            {TRIGGER_EVENTS.map((e) => (
              <option key={e} value={e}>
                {TRIGGER_EVENT_LABEL[e]} ({e})
              </option>
            ))}
          </select>
          <small>
            '사용중'으로 바꾸면 이 일이 생길 때마다 만든 사람 권한으로 자동 실행됩니다. 받는 값:{' '}
            {'{{input.event.…}}'} —{' '}
            {TRIGGER_EVENT_FIELDS[c.event as keyof typeof TRIGGER_EVENT_FIELDS] ?? 'id, type'}
          </small>
        </Label>
      )}
      {c.kind === 'chat' && (
        <div className={styles.note}>
          AI 비서 대화에서 이 에이전트를 불러 쓸 때의 입력값을 정합니다.
        </div>
      )}
      <div className={styles.box}>
        <div className={styles.boxHead}>
          입력값 <span className={styles.note}>{'{{input.이름}}'}</span>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() =>
              patch({
                inputFields: [
                  ...c.inputFields,
                  {
                    name: `field${c.inputFields.length + 1}`,
                    type: 'string',
                    required: false,
                    description: '',
                  },
                ],
              })
            }
          >
            + 추가
          </button>
        </div>
        {!c.inputFields.length && <div className={styles.note}>입력값 없음</div>}
        {c.inputFields.map((f, i) => (
          <div key={i} className={styles.box} style={{ background: 'var(--ark-color-bg)' }}>
            <div className={styles.row}>
              <input
                className={`${styles.input} ${styles.mono}`}
                value={f.name}
                onChange={(e) => setField(i, { name: e.target.value })}
                placeholder="이름(영문)"
              />
              <select
                className={styles.select}
                style={{ width: 90 }}
                value={f.type}
                onChange={(e) => setField(i, { type: e.target.value as never })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className={styles.row}>
              <input
                className={styles.input}
                value={f.description}
                onChange={(e) => setField(i, { description: e.target.value })}
                placeholder="설명"
              />
              <label className={styles.check} style={{ whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => setField(i, { required: e.target.checked })}
                />
                필수
              </label>
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => patch({ inputFields: c.inputFields.filter((_, k) => k !== i) })}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cur = AGENT_MODELS.find((m) => m.id === value);
  return (
    <>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {AGENT_MODELS.map((m) => (
          <option key={m.id} value={m.id} disabled={!m.enabled}>
            {m.label} — {m.hint}
          </option>
        ))}
      </select>
      {cur && !cur.enabled && (
        <span className={styles.hint}>
          {cur.label}은(는) 아직 닫혀 있어 실행할 때는 {AGENT_MODELS[0].label}로 돕니다.
        </span>
      )}
    </>
  );
}

function LlmFields({ c, patch, vars }: { c: LlmConfig; patch: Patch; vars: AgentVar[] }) {
  return (
    <>
      <Label title="모델">
        <ModelSelect value={c.model} onChange={(v) => patch({ model: v })} />
      </Label>
      <Label
        title="생각 깊이(effort)"
        hint="낮을수록 빠르고 쌉니다. 글쓰기·요약은 보통 낮음으로 충분합니다."
      >
        <SegmentedControl
          size="sm"
          fullWidth
          value={c.effort}
          onChange={(v) => patch({ effort: v })}
          options={[
            { value: 'low', label: '낮음' },
            { value: 'medium', label: '보통' },
            { value: 'high', label: '높음' },
          ]}
        />
      </Label>
      <Label title="지시문(역할·규칙)">
        <TemplateInput
          multiline
          rows={4}
          value={c.instructions}
          onChange={(v) => patch({ instructions: v })}
          vars={vars}
        />
      </Label>
      <Label title="이번 내용" hint="'{{'를 치면 위쪽 노드의 결과 변수가 나옵니다.">
        <TemplateInput
          multiline
          rows={4}
          value={c.prompt}
          onChange={(v) => patch({ prompt: v })}
          vars={vars}
        />
      </Label>
      <VarChips vars={vars} onPick={(n) => patch({ prompt: `${c.prompt}{{${n}}}` })} />
      <Label title="결과 형식">
        <SegmentedControl
          size="sm"
          fullWidth
          value={c.outputFormat}
          onChange={(v) => patch({ outputFormat: v })}
          options={[
            { value: 'text', label: '글' },
            { value: 'json', label: 'JSON(구조화)' },
          ]}
        />
      </Label>
      {c.outputFormat === 'json' && (
        <div className={styles.box}>
          <div className={styles.boxHead}>
            결과 필드
            <button
              type="button"
              className={styles.smallBtn}
              onClick={() =>
                patch({
                  jsonFields: [
                    ...c.jsonFields,
                    { name: `field${c.jsonFields.length + 1}`, type: 'string', description: '' },
                  ],
                })
              }
            >
              + 추가
            </button>
          </div>
          {c.jsonFields.map((f, i) => (
            <div key={i} className={styles.row}>
              <input
                className={`${styles.input} ${styles.mono}`}
                value={f.name}
                onChange={(e) =>
                  patch({
                    jsonFields: c.jsonFields.map((x, k) =>
                      k === i ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <select
                className={styles.select}
                style={{ width: 84 }}
                value={f.type}
                onChange={(e) =>
                  patch({
                    jsonFields: c.jsonFields.map((x, k) =>
                      k === i ? { ...x, type: e.target.value } : x,
                    ),
                  })
                }
              >
                <option>string</option>
                <option>number</option>
                <option>boolean</option>
              </select>
              <input
                className={styles.input}
                placeholder="설명"
                value={f.description}
                onChange={(e) =>
                  patch({
                    jsonFields: c.jsonFields.map((x, k) =>
                      k === i ? { ...x, description: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => patch({ jsonFields: c.jsonFields.filter((_, k) => k !== i) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <Label title="결과 변수">
        <input
          className={`${styles.input} ${styles.mono}`}
          value={c.outputVar}
          onChange={(e) => patch({ outputVar: e.target.value })}
        />
      </Label>
    </>
  );
}

function ToolFields({
  c,
  patch,
  vars,
  tools,
  toolMap,
  references,
  onUploadReference,
}: {
  c: ToolConfig;
  patch: Patch;
  vars: AgentVar[];
  tools: AgentToolInfo[];
  toolMap: Map<string, AgentToolInfo>;
  references: ReferenceOpt[];
  onUploadReference?: (file: File) => Promise<ReferenceOpt | null>;
}) {
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const info = toolMap.get(c.tool);
  const props = info?.inputSchema.properties ?? {};
  const req = new Set(info?.inputSchema.required ?? []);
  const extra = Object.keys(c.args).filter((k) => !(k in props));
  const setArg = (k: string, v: string) => patch({ args: { ...c.args, [k]: v } });
  const bodySkeleton = (k: string) => {
    const sub = props[k]?.properties ?? {};
    const reqs = new Set(props[k]?.required ?? []);
    const o = Object.fromEntries(
      Object.keys(sub)
        .filter((p) => reqs.has(p) || Object.keys(sub).length <= 6)
        .map((p) => [p, '']),
    );
    setArg(k, JSON.stringify(o, null, 2));
  };

  return (
    <>
      <div className={styles.box}>
        <div className={styles.boxHead}>
          도구
          <button type="button" className={styles.smallBtn} onClick={() => setPicking(true)}>
            {c.tool ? '바꾸기' : '고르기'}
          </button>
        </div>
        {c.tool ? (
          <>
            <div className={styles.toolName}>
              {info && <ModeBadge mode={info.mode} />}
              {c.tool}
            </div>
            {info ? (
              <div className={styles.toolDesc}>{info.description}</div>
            ) : (
              <div className={styles.errDot} style={{ fontSize: 12, fontWeight: 400 }}>
                이 계정에서 쓸 수 없는 도구입니다(권한 없음 또는 이름 오류).
              </div>
            )}
            {info?.mode === 'WRITE' && (
              <div className={styles.warnNote}>
                데이터를 바꾸는 쓰기 도구입니다. 테스트 실행에서는 실제로 실행하지 않고, 실제 실행은
                사람 승인 뒤에만 됩니다.
              </div>
            )}
          </>
        ) : (
          <div className={styles.note}>왼쪽 도구 탐색기에서 끌어 오거나 "고르기"를 누르세요.</div>
        )}
      </div>

      {info && (
        <div className={styles.box}>
          <div className={styles.boxHead}>인자 연결</div>
          <div className={styles.note}>
            값은 글자·숫자·JSON(예: false, 50, {'{"a":1}'})이나 {'{{변수}}'} 템플릿. 값 전체가{' '}
            {'{{경로}}'}면 목록·객체가 그대로 넘어갑니다. 목록에서 한 칸씩 뽑기:{' '}
            {'{{leads.rows[*].customerId}}'}
          </div>
          {!Object.keys(props).length && <div className={styles.note}>인자 없음</div>}
          {Object.entries(props).map(([k, s]) => (
            <Label
              key={k}
              title={`${k}${req.has(k) ? ' *' : ''}`}
              hint={[
                s.description,
                s.enum ? `값: ${s.enum.join(', ')}` : '',
                s.type ? `(${String(s.type)})` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {c.tool === 'create_file_from_template' && k === 'templateId' ? (
                <div className={styles.row}>
                  <select
                    className={styles.select}
                    style={{ flex: 1, minWidth: 0 }}
                    value={c.args[k] ?? ''}
                    onChange={(e) => setArg(k, e.target.value)}
                  >
                    <option value="">양식 고르기</option>
                    {references.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {c.args[k] && !references.some((r) => r.id === c.args[k]) && (
                      <option value={c.args[k]}>(목록에 없는 양식)</option>
                    )}
                  </select>
                  {onUploadReference && (
                    <>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                      >
                        {uploading ? '올리는 중…' : '새 양식 올리기'}
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        hidden
                        accept=".xlsx,.csv"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          setUploading(true);
                          const r = await onUploadReference(f);
                          setUploading(false);
                          if (r) setArg(k, r.id);
                        }}
                      />
                    </>
                  )}
                </div>
              ) : (
                <TemplateInput
                  value={c.args[k] ?? ''}
                  onChange={(v) => setArg(k, v)}
                  vars={vars}
                  mono
                  multiline={!!s.properties}
                  rows={s.properties ? 5 : 1}
                  placeholder={
                    s.properties
                      ? '{ "필드": "값 또는 {{변수}}" }'
                      : req.has(k)
                        ? '필수'
                        : '비우면 보내지 않음'
                  }
                />
              )}
              {s.properties && (
                <button
                  type="button"
                  className={styles.smallBtn}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => bodySkeleton(k)}
                >
                  필드 틀 채우기
                </button>
              )}
            </Label>
          ))}
          {extra.map((k) => (
            <div key={k} className={styles.row}>
              <span className={styles.argName}>{k}</span>
              <span className={styles.warnNote}>이 도구에 없는 인자</span>
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => {
                  const next = { ...c.args };
                  delete next[k];
                  patch({ args: next });
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
      <Label
        title="결과 변수"
        hint="도구 응답이 이 이름으로 남습니다. 실패 포트를 이으면 실패해도 멈추지 않고 그쪽으로 갑니다."
      >
        <input
          className={`${styles.input} ${styles.mono}`}
          value={c.outputVar}
          onChange={(e) => patch({ outputVar: e.target.value })}
        />
      </Label>

      <Modal open={picking} onOpenChange={setPicking} title="도구 고르기" size="lg">
        <div style={{ height: 460, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ToolExplorer
            tools={tools}
            draggable={false}
            autoFocus
            pickLabel="이 도구로"
            onPick={(t) => {
              const keep = Object.fromEntries(
                Object.entries(c.args).filter(([k]) => k in (t.inputSchema.properties ?? {})),
              );
              patch({ tool: t.name, args: keep });
              setPicking(false);
            }}
          />
        </div>
        {info && <SchemaPreview schema={info.inputSchema} />}
      </Modal>
    </>
  );
}

function BranchFields({ c, patch, vars }: { c: BranchConfig; patch: Patch; vars: AgentVar[] }) {
  const setCase = (i: number, p: Partial<BranchCase>) =>
    patch({ cases: c.cases.map((k, j) => (j === i ? { ...k, ...p } : k)) });
  const move = (i: number, d: number) => {
    const next = [...c.cases];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ cases: next });
  };
  return (
    <>
      <Label title="분기 방식">
        <SegmentedControl
          size="sm"
          fullWidth
          value={c.mode}
          onChange={(v) => patch({ mode: v })}
          options={[
            { value: 'condition', label: '조건식' },
            { value: 'classify', label: 'AI 분류' },
          ]}
        />
      </Label>
      {c.mode === 'classify' && (
        <>
          <Label title="분류할 내용">
            <TemplateInput
              multiline
              value={c.input}
              onChange={(v) => patch({ input: v })}
              vars={vars}
            />
          </Label>
          <Label title="분류 기준(지시문)">
            <textarea
              className={styles.textarea}
              value={c.instructions}
              onChange={(e) => patch({ instructions: e.target.value })}
            />
          </Label>
          <Label title="모델">
            <ModelSelect value={c.model} onChange={(v) => patch({ model: v })} />
          </Label>
          <Label title="결과 변수(고른 갈래 id)">
            <input
              className={`${styles.input} ${styles.mono}`}
              value={c.outputVar}
              onChange={(e) => patch({ outputVar: e.target.value })}
            />
          </Label>
        </>
      )}
      <div className={styles.box}>
        <div className={styles.boxHead}>
          갈래(출력 포트) — 위에서부터
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() =>
              patch({
                cases: [
                  ...c.cases,
                  {
                    id: `case${c.cases.length + 1}`,
                    label: `갈래 ${c.cases.length + 1}`,
                    expr: '',
                    description: '',
                  },
                ],
              })
            }
          >
            + 갈래
          </button>
        </div>
        {c.mode === 'condition' && (
          <div className={styles.note}>
            조건식 예: <code>leads.total &gt; 0</code>,{' '}
            <code>contains(category, &apos;이사&apos;)</code>,{' '}
            <code>!empty(result.rows) &amp;&amp; result.total &lt; 100</code>. 처음 참인 갈래로
            가고, 모두 거짓이면 &quot;그 외&quot;.
          </div>
        )}
        {c.cases.map((k, i) => (
          <div key={i} className={styles.box} style={{ background: 'var(--ark-color-bg)' }}>
            <div className={styles.row}>
              <input
                className={styles.input}
                value={k.label}
                onChange={(e) => setCase(i, { label: e.target.value })}
                placeholder="이름"
              />
              <input
                className={`${styles.input} ${styles.mono}`}
                style={{ width: 90 }}
                value={k.id}
                onChange={(e) => setCase(i, { id: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
                title="포트 id(영문)"
              />
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => move(i, -1)}
                title="위로"
              >
                ↑
              </button>
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => patch({ cases: c.cases.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
            {c.mode === 'condition' ? (
              <TemplateInput
                bare
                mono
                value={k.expr}
                onChange={(v) => setCase(i, { expr: v })}
                vars={vars}
                placeholder="조건식"
              />
            ) : (
              <input
                className={styles.input}
                value={k.description}
                onChange={(e) => setCase(i, { description: e.target.value })}
                placeholder="이 갈래를 고르는 기준"
              />
            )}
          </div>
        ))}
        <div className={styles.note}>+ &quot;그 외(else)&quot; 포트는 항상 있습니다.</div>
      </div>
    </>
  );
}

function LoopFields({ c, patch, vars }: { c: LoopConfig; patch: Patch; vars: AgentVar[] }) {
  return (
    <>
      <Label
        title="반복할 목록"
        hint="예: leads.rows — '항목마다' 포트에 이은 노드들이 항목 수만큼 실행되고, 다 돌면 '끝나면' 포트로 갑니다."
      >
        <TemplateInput
          bare
          mono
          value={c.listVar}
          onChange={(v) => patch({ listVar: v })}
          vars={vars}
        />
      </Label>
      <Label
        title="항목 변수"
        hint={`본문에서 {{${c.itemVar || 'item'}}}, 순번은 {{${c.itemVar || 'item'}Index}}`}
      >
        <input
          className={`${styles.input} ${styles.mono}`}
          value={c.itemVar}
          onChange={(e) => patch({ itemVar: e.target.value })}
        />
      </Label>
      <Label title="최대 항목 수(안전 한도)">
        <input
          className={styles.input}
          type="number"
          min={1}
          max={500}
          value={c.maxItems}
          onChange={(e) => patch({ maxItems: Number(e.target.value) || 1 })}
        />
      </Label>
    </>
  );
}

function GuardrailFields({
  c,
  patch,
  tools,
}: {
  c: GuardrailConfig;
  patch: Patch;
  tools: AgentToolInfo[];
}) {
  const [adding, setAdding] = useState<GuardrailKind>('maxSteps');
  const setRule = (i: number, p: Partial<GuardrailRule>) =>
    patch({ rules: c.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const fresh = (kind: GuardrailKind): GuardrailRule => {
    switch (kind) {
      case 'maxSteps':
        return { kind, value: 30 };
      case 'maxLlmCalls':
        return { kind, value: 5 };
      case 'maxRecipients':
        return { kind, value: 50 };
      case 'allowTools':
      case 'blockTools':
      case 'recipientAllowlist':
        return { kind, list: [] };
      case 'timeWindow':
        return { kind, startHour: 9, endHour: 18, weekdays: [1, 2, 3, 4, 5] };
      default:
        return { kind };
    }
  };
  return (
    <>
      <div className={styles.note}>
        가드레일을 지난 뒤의 모든 단계에 규칙이 걸립니다. 어기면 실행이 &quot;가드레일
        차단&quot;으로 멈춥니다.
      </div>
      {c.rules.map((r, i) => (
        <div key={i} className={styles.box}>
          <div className={styles.boxHead}>
            {GUARDRAIL_LABEL[r.kind]}
            <button
              type="button"
              className={`${styles.smallBtn} ${styles.dangerBtn}`}
              onClick={() => patch({ rules: c.rules.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
          {(r.kind === 'maxSteps' || r.kind === 'maxLlmCalls' || r.kind === 'maxRecipients') && (
            <input
              className={styles.input}
              type="number"
              min={1}
              value={r.value ?? ''}
              onChange={(e) => setRule(i, { value: Number(e.target.value) || 0 })}
            />
          )}
          {(r.kind === 'allowTools' || r.kind === 'blockTools') && (
            <>
              <input
                className={`${styles.input} ${styles.mono}`}
                list="agent-tool-names"
                value={(r.list ?? []).join(', ')}
                onChange={(e) =>
                  setRule(i, {
                    list: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="도구 이름을 쉼표로"
              />
              <datalist id="agent-tool-names">
                {tools.map((t) => (
                  <option key={t.name} value={t.name} />
                ))}
              </datalist>
            </>
          )}
          {r.kind === 'recipientAllowlist' && (
            <textarea
              className={`${styles.textarea} ${styles.mono}`}
              value={(r.list ?? []).join('\n')}
              onChange={(e) =>
                setRule(i, {
                  list: e.target.value
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="고객 id를 줄마다"
            />
          )}
          {r.kind === 'timeWindow' && (
            <>
              <div className={styles.row}>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={24}
                  value={r.startHour ?? 0}
                  onChange={(e) => setRule(i, { startHour: Number(e.target.value) })}
                />
                <span>시 ~</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={24}
                  value={r.endHour ?? 24}
                  onChange={(e) => setRule(i, { endHour: Number(e.target.value) })}
                />
                <span>시</span>
              </div>
              <div className={styles.weekdays}>
                {WEEKDAYS.map((d, k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={(r.weekdays ?? []).includes(k)}
                      onChange={(e) =>
                        setRule(i, {
                          weekdays: e.target.checked
                            ? [...(r.weekdays ?? []), k].sort()
                            : (r.weekdays ?? []).filter((x) => x !== k),
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </>
          )}
          {r.kind === 'requireApproval' && (
            <div className={styles.note}>
              이후 쓰기 도구는 호출할 때마다 사람이 승인해야 실행됩니다.
            </div>
          )}
          {r.kind === 'piiMask' && (
            <div className={styles.note}>
              AI에 넘기는 글과 실행 기록에서 전화번호·이메일을 가립니다.
            </div>
          )}
        </div>
      ))}
      <div className={styles.row}>
        <select
          className={styles.select}
          value={adding}
          onChange={(e) => setAdding(e.target.value as GuardrailKind)}
        >
          {GUARDRAIL_KINDS.map((k) => (
            <option key={k} value={k}>
              {GUARDRAIL_LABEL[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.smallBtn}
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => patch({ rules: [...c.rules, fresh(adding)] })}
        >
          + 규칙
        </button>
      </div>
    </>
  );
}
