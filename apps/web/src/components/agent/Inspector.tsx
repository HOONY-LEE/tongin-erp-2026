import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useRef, useState, type ReactNode } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { SegmentedControl } from '../ui';
import {
  AGENT_NODE_DESC,
  FIELD_TYPES,
  GUARDRAIL_KINDS,
  TRIGGER_EVENTS,
  TRIGGER_EVENT_FIELDS,
  TRIGGER_KINDS,
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
import { useAiModels } from '../../lib/aiModels';
import styles from '../../pages/agentBuilder.module.css';
import { fs } from '../../lib/fontScale';
import {
  AGENT_NODE_LABEL,
  GUARDRAIL_LABEL,
  TRIGGER_EVENT_LABEL,
  TRIGGER_KIND_LABEL,
} from '../../i18n/codes';

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

const WEEKDAYS = [
  i18n.t('agent.dow.0'),
  i18n.t('agent.dow.1'),
  i18n.t('agent.dow.2'),
  i18n.t('agent.dow.3'),
  i18n.t('agent.dow.4'),
  i18n.t('agent.dow.5'),
  i18n.t('agent.dow.6'),
];
const CRON_PRESETS = [
  { cron: '0 9 * * 1', label: i18n.t('agent.cron.weeklyMon') },
  { cron: '0 9 * * *', label: i18n.t('agent.cron.daily') },
  { cron: '0 18 * * 1-5', label: i18n.t('agent.cron.weekdays') },
  { cron: '0 8 1 * *', label: i18n.t('agent.cron.monthly') },
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
  const { t } = useTranslation();
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
        <button
          type="button"
          className={styles.iconBtn}
          title={t('agent.duplicate')}
          onClick={onDuplicate}
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.dangerBtn}`}
          title={t('agent.deleteKey')}
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
              style={{ fontWeight: 400, fontSize: fs(12) }}
            >
              {i.level === 'error' ? t('agent.error') : t('agent.warning')} · {i.message}
            </div>
          ))}
        </div>
      )}

      <Label title={t('agent.name')}>
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
        <Label title={t('agent.approvalText')} hint={t('agent.approvalHint')}>
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
            title={t('agent.finalReply')}
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
  const { t } = useTranslation();
  const setField = (i: number, p: Partial<TriggerConfig['inputFields'][number]>) =>
    patch({ inputFields: c.inputFields.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  return (
    <>
      <Label title={t('agent.triggerKind')}>
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
        <Label title={t('agent.cronExpr')} hint={t('agent.cronHint')}>
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
            t('agent.st.ACTIVE'){t('agent.scheduleHint1')}
            {t('agent.scheduleHint2')}
          </small>
        </Label>
      )}
      {c.kind === 'event' && (
        <Label title={t('agent.event')}>
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
            t('agent.st.ACTIVE'){t('agent.eventHint')} {'{{input.event.…}}'} —{' '}
            {TRIGGER_EVENT_FIELDS[c.event as keyof typeof TRIGGER_EVENT_FIELDS] ?? 'id, type'}
          </small>
        </Label>
      )}
      {c.kind === 'chat' && <div className={styles.note}>{t('agent.inputsHint')}</div>}
      <div className={styles.box}>
        <div className={styles.boxHead}>
          {t('agent.inputs')} <span className={styles.note}>{'{{input.이름}}'}</span>
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
            {t('agent.addInput')}
          </button>
        </div>
        {!c.inputFields.length && <div className={styles.note}>{t('agent.noInputs')}</div>}
        {c.inputFields.map((f, i) => (
          <div key={i} className={styles.box} style={{ background: 'var(--ark-color-bg)' }}>
            <div className={styles.row}>
              <input
                className={`${styles.input} ${styles.mono}`}
                value={f.name}
                onChange={(e) => setField(i, { name: e.target.value })}
                placeholder={t('agent.nameEn')}
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
                placeholder={t('agent.desc')}
              />
              <label className={styles.check} style={{ whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => setField(i, { required: e.target.checked })}
                />
                {t('agent.required')}
              </label>
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => patch({ inputFields: c.inputFields.filter((_, k) => k !== i) })}
              >
                {t('agent.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  // Claude에서 받아 둔 모델 목록(이 계정에 열린 것만 고를 수 있음)
  const models = useAiModels();
  const cur = models.find((m) => m.id === value);
  const fallback = models.find((m) => m.enabled && m.chat) ?? models.find((m) => m.enabled);
  return (
    <>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {!cur && value && <option value={value}>{value}</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id} disabled={!m.enabled}>
            {m.label} — {m.hint}
          </option>
        ))}
      </select>
      {(!cur || !cur.enabled) && fallback && (
        <span className={styles.hint}>
          {cur?.label ?? value}
          {t('agent.fallback1')}
          {fallback.label}
          {t('agent.fallback2')}
          {t('agent.fallback3')}
        </span>
      )}
    </>
  );
}

function LlmFields({ c, patch, vars }: { c: LlmConfig; patch: Patch; vars: AgentVar[] }) {
  const { t } = useTranslation();
  return (
    <>
      <Label title={t('agent.model')}>
        <ModelSelect value={c.model} onChange={(v) => patch({ model: v })} />
      </Label>
      <Label title={t('agent.effortLabel')} hint={t('agent.effortHint')}>
        <SegmentedControl
          size="sm"
          fullWidth
          value={c.effort}
          onChange={(v) => patch({ effort: v })}
          options={[
            { value: 'low', label: t('agent.effort.low') },
            { value: 'medium', label: t('agent.effort.medium') },
            { value: 'high', label: t('agent.effort.high') },
          ]}
        />
      </Label>
      <Label title={t('agent.instructions')}>
        <TemplateInput
          multiline
          rows={4}
          value={c.instructions}
          onChange={(v) => patch({ instructions: v })}
          vars={vars}
        />
      </Label>
      <Label title={t('agent.inputContent')} hint="'{{'를 치면 위쪽 노드의 결과 변수가 나옵니다.">
        <TemplateInput
          multiline
          rows={4}
          value={c.prompt}
          onChange={(v) => patch({ prompt: v })}
          vars={vars}
        />
      </Label>
      <VarChips vars={vars} onPick={(n) => patch({ prompt: `${c.prompt}{{${n}}}` })} />
      <Label title={t('agent.outputFormat')}>
        <SegmentedControl
          size="sm"
          fullWidth
          value={c.outputFormat}
          onChange={(v) => patch({ outputFormat: v })}
          options={[
            { value: 'text', label: t('agent.fmt.text') },
            { value: 'json', label: t('agent.fmt.json') },
          ]}
        />
      </Label>
      {c.outputFormat === 'json' && (
        <div className={styles.box}>
          <div className={styles.boxHead}>
            {t('agent.outputFields')}
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
              {t('agent.addInput')}
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
                placeholder={t('agent.desc')}
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
      <Label title={t('agent.outputVar')}>
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
  const { t } = useTranslation();
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
          {t('agent.tool')}
          <button type="button" className={styles.smallBtn} onClick={() => setPicking(true)}>
            {c.tool ? t('agent.change') : t('agent.pick')}
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
              <div className={styles.errDot} style={{ fontSize: fs(12), fontWeight: 400 }}>
                {t('agent.toolUnavailable')}
              </div>
            )}
            {info?.mode === 'WRITE' && (
              <div className={styles.warnNote}>
                {t('agent.writeTool1')}
                {t('agent.writeTool2')}
              </div>
            )}
          </>
        ) : (
          <div className={styles.note}>
            {t('agent.pickTool1')} t('agent.pick'){t('agent.pickTool2')}
          </div>
        )}
      </div>

      {info && (
        <div className={styles.box}>
          <div className={styles.boxHead}>{t('agent.args')}</div>
          <div className={styles.note}>
            {t('agent.argsHint1')} {'{"a":1}'}
            {t('agent.argsHint2')} {'{{변수}}'} {t('agent.argsHint3')} {'{{경로}}'}
            {t('agent.argsHint4')} {'{{leads.rows[*].customerId}}'}
          </div>
          {!Object.keys(props).length && <div className={styles.note}>{t('agent.noArgs')}</div>}
          {Object.entries(props).map(([k, s]) => (
            <Label
              key={k}
              title={`${k}${req.has(k) ? ' *' : ''}`}
              hint={[
                s.description,
                s.enum ? t('agent.values', { v0: s.enum.join(', ') }) : '',
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
                    <option value="">{t('agent.pickTemplate')}</option>
                    {references.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {c.args[k] && !references.some((r) => r.id === c.args[k]) && (
                      <option value={c.args[k]}>{t('agent.unknownTemplate')}</option>
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
                        {uploading ? t('agent.uploading') : t('agent.uploadTemplate')}
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
                        ? t('agent.required')
                        : t('agent.blankSkip')
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
                  {t('agent.fillFields')}
                </button>
              )}
            </Label>
          ))}
          {extra.map((k) => (
            <div key={k} className={styles.row}>
              <span className={styles.argName}>{k}</span>
              <span className={styles.warnNote}>{t('agent.unknownArgs')}</span>
              <button
                type="button"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                onClick={() => {
                  const next = { ...c.args };
                  delete next[k];
                  patch({ args: next });
                }}
              >
                {t('agent.delete')}
              </button>
            </div>
          ))}
        </div>
      )}
      <Label title={t('agent.outputVar')} hint={t('agent.toolOutHint')}>
        <input
          className={`${styles.input} ${styles.mono}`}
          value={c.outputVar}
          onChange={(e) => patch({ outputVar: e.target.value })}
        />
      </Label>

      <Modal open={picking} onOpenChange={setPicking} title={t('agent.pickToolTitle')} size="lg">
        <div style={{ height: 460, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ToolExplorer
            tools={tools}
            draggable={false}
            autoFocus
            pickLabel={t('agent.useTool')}
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
  const { t } = useTranslation();
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
      <Label title={t('agent.branchKind')}>
        <SegmentedControl
          size="sm"
          fullWidth
          value={c.mode}
          onChange={(v) => patch({ mode: v })}
          options={[
            { value: 'condition', label: t('agent.branch.expr') },
            { value: 'classify', label: t('agent.branch.ai') },
          ]}
        />
      </Label>
      {c.mode === 'classify' && (
        <>
          <Label title={t('agent.classifyInput')}>
            <TemplateInput
              multiline
              value={c.input}
              onChange={(v) => patch({ input: v })}
              vars={vars}
            />
          </Label>
          <Label title={t('agent.classifyRule')}>
            <textarea
              className={styles.textarea}
              value={c.instructions}
              onChange={(e) => patch({ instructions: e.target.value })}
            />
          </Label>
          <Label title={t('agent.model')}>
            <ModelSelect value={c.model} onChange={(v) => patch({ model: v })} />
          </Label>
          <Label title={t('agent.classifyVar')}>
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
          {t('agent.cases')}
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() =>
              patch({
                cases: [
                  ...c.cases,
                  {
                    id: `case${c.cases.length + 1}`,
                    label: t('agent.caseN', { v0: c.cases.length + 1 }),
                    expr: '',
                    description: '',
                  },
                ],
              })
            }
          >
            {t('agent.addCase')}
          </button>
        </div>
        {c.mode === 'condition' && (
          <div className={styles.note}>
            {t('agent.exprEx')} <code>leads.total &gt; 0</code>,{' '}
            <code>contains(category, &apos;이사&apos;)</code>,{' '}
            <code>!empty(result.rows) &amp;&amp; result.total &lt; 100</code>
            {t('agent.exprHint1')}
            {t('agent.exprHint2')}
          </div>
        )}
        {c.cases.map((k, i) => (
          <div key={i} className={styles.box} style={{ background: 'var(--ark-color-bg)' }}>
            <div className={styles.row}>
              <input
                className={styles.input}
                value={k.label}
                onChange={(e) => setCase(i, { label: e.target.value })}
                placeholder={t('agent.name')}
              />
              <input
                className={`${styles.input} ${styles.mono}`}
                style={{ width: 90 }}
                value={k.id}
                onChange={(e) => setCase(i, { id: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
                title={t('agent.portId')}
              />
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => move(i, -1)}
                title={t('agent.up')}
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
                placeholder={t('agent.branch.expr')}
              />
            ) : (
              <input
                className={styles.input}
                value={k.description}
                onChange={(e) => setCase(i, { description: e.target.value })}
                placeholder={t('agent.caseRule')}
              />
            )}
          </div>
        ))}
        <div className={styles.note}>{t('agent.elseNote')}</div>
      </div>
    </>
  );
}

function LoopFields({ c, patch, vars }: { c: LoopConfig; patch: Patch; vars: AgentVar[] }) {
  const { t } = useTranslation();
  return (
    <>
      <Label title={t('agent.loopList')} hint={t('agent.loopHint')}>
        <TemplateInput
          bare
          mono
          value={c.listVar}
          onChange={(v) => patch({ listVar: v })}
          vars={vars}
        />
      </Label>
      <Label
        title={t('agent.itemVar')}
        hint={`본문에서 {{${c.itemVar || 'item'}}}, 순번은 {{${c.itemVar || 'item'}Index}}`}
      >
        <input
          className={`${styles.input} ${styles.mono}`}
          value={c.itemVar}
          onChange={(e) => patch({ itemVar: e.target.value })}
        />
      </Label>
      <Label title={t('agent.maxItems')}>
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
  const { t } = useTranslation();
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
        {t('agent.guardHint1')}
        {t('agent.guardHint2')}
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
                placeholder={t('agent.toolsCsv')}
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
              placeholder={t('agent.customerIds')}
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
                <span>{t('agent.hourTo')}</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={24}
                  value={r.endHour ?? 24}
                  onChange={(e) => setRule(i, { endHour: Number(e.target.value) })}
                />
                <span>{t('agent.hour')}</span>
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
            <div className={styles.note}>{t('agent.approveAfter')}</div>
          )}
          {r.kind === 'piiMask' && <div className={styles.note}>{t('agent.maskPii')}</div>}
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
          {t('agent.addRule')}
        </button>
      </div>
    </>
  );
}
