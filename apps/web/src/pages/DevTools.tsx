import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, RotateCcw } from 'lucide-react';
import { permissionLabel } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { fmtDateTime } from '../lib/dateFormat';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  CopyText,
  DataTable,
  FilterButton,
  ListPage,
  PageCard,
  RecordDetail,
  Textarea,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
} from '../components/ui';
import styles from './DevTools.module.css';

interface JsonSchema {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}
interface Tool {
  name: string;
  description: string;
  group: string | null;
  source: 'domain' | 'api';
  endpoint: string | null;
  mode: 'READ' | 'WRITE';
  permissions: string[];
  deferred: boolean;
  inputSchema: JsonSchema;
  calls30d: number;
  lastUsedAt: string | null;
}
type RunResult = { ok: boolean; ms: number; result?: unknown; error?: string };

/** 입력 스키마 → 시험 실행 처음 값(필수 칸만 빈 값으로) */
function sampleInput(s: JsonSchema): string {
  const out: Record<string, unknown> = {};
  for (const k of s.required ?? []) {
    const p = s.properties?.[k];
    out[k] =
      p?.type === 'number' || p?.type === 'integer'
        ? 0
        : p?.type === 'boolean'
          ? false
          : p?.type === 'array'
            ? []
            : p?.type === 'object'
              ? {}
              : '';
  }
  return JSON.stringify(out, null, 2);
}
const typeOf = (p: JsonSchema): string =>
  p.enum?.length
    ? p.enum.map(String).join(' | ')
    : p.type === 'array'
      ? `${p.items ? typeOf(p.items) : 'any'}[]`
      : [p.type ?? 'any', p.format].filter(Boolean).join(' · ');

/**
 * 개발자 메뉴 — AI가 쓸 수 있는 도구 전부. AI 업무 도구 + ERP API(라우트마다 자동 등록).
 * 행을 누르면 설명·입력값·권한과 시험 실행. 시험 실행은 조회 도구만, 내 권한으로. 권한: AI.DEV
 */
export default function DevTools() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { updatedAt, touch } = useUpdatedAt();
  const { id: detailId, open, close } = useDetailParam();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [flt, setFlt] = useState<FilterValues>({});
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTools(await api<Tool[]>('/dev/tools'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('devt.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t, touch]);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => [...new Set(tools.map((x) => x.group).filter((g): g is string => !!g))].sort(),
    [tools],
  );
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const mode = flt.mode as string | undefined;
    const source = flt.source as string | undefined;
    const group = flt.group as string[] | undefined;
    const used = flt.used as string | undefined;
    return tools
      .filter(
        (x) =>
          (!k ||
            x.name.toLowerCase().includes(k) ||
            x.description.toLowerCase().includes(k) ||
            (x.endpoint ?? '').toLowerCase().includes(k)) &&
          (!mode || x.mode === mode) &&
          (!source || x.source === source) &&
          (!group?.length || (x.group && group.includes(x.group))) &&
          (!used || (used === 'yes' ? x.calls30d > 0 : x.calls30d === 0)),
      )
      .sort(
        (a, b) =>
          (a.source === b.source ? 0 : a.source === 'domain' ? -1 : 1) ||
          b.calls30d - a.calls30d ||
          a.name.localeCompare(b.name),
      )
      .map((x) => ({
        ...x,
        id: x.name,
        summary: x.description.split('\n')[0],
        groupText: x.group ?? '',
        endpointText: x.endpoint ?? '',
      }));
  }, [tools, q, flt]);

  const filterFields: FilterField[] = [
    {
      key: 'mode',
      label: t('devt.flt.mode'),
      type: 'single',
      options: [
        { value: 'READ', label: t('devt.mode.READ') },
        { value: 'WRITE', label: t('devt.mode.WRITE') },
      ],
    },
    {
      key: 'source',
      label: t('devt.flt.source'),
      type: 'single',
      options: [
        { value: 'domain', label: t('devt.source.domain') },
        { value: 'api', label: t('devt.source.api') },
      ],
    },
    {
      key: 'group',
      label: t('devt.flt.group'),
      type: 'multi',
      options: groups.map((g) => ({ value: g, label: g })),
    },
    {
      key: 'used',
      label: t('devt.flt.used'),
      type: 'single',
      options: [
        { value: 'yes', label: t('devt.used.yes') },
        { value: 'no', label: t('devt.used.no') },
      ],
    },
  ];

  const ModeBadge = ({ mode }: { mode: Tool['mode'] }) => (
    <Badge variant="subtle" color={mode === 'READ' ? 'info' : 'warning'}>
      {t(`devt.mode.${mode}`)}
    </Badge>
  );
  const columns: Column[] = [
    {
      title: t('devt.col.name'),
      minWidth: 260,
      flex: 1,
      render: (r) => (
        <div className={styles.nameCell}>
          <span className="id-mono">{String(r.name)}</span>
          <small>{String(r.summary)}</small>
        </div>
      ),
    },
    {
      title: t('devt.col.mode'),
      width: 76,
      render: (r) => <ModeBadge mode={r.mode as Tool['mode']} />,
    },
    { title: t('devt.col.group'), dataIndex: 'groupText', width: 140 },
    {
      title: t('devt.col.endpoint'),
      minWidth: 200,
      render: (r) =>
        r.endpoint ? (
          <span className="id-mono">{String(r.endpoint)}</span>
        ) : (
          <span className={styles.muted}>
            {t(r.source === 'domain' ? 'devt.source.domain' : 'devt.source.api')}
          </span>
        ),
    },
    { title: t('devt.col.calls'), dataIndex: 'calls30d', numeric: true, width: 96 },
  ];

  const detail = detailId ? tools.find((x) => x.name === detailId) : null;
  if (detailId) {
    return (
      <RecordDetail
        loading={!detail && loading}
        title={detail?.name ?? t('devt.notFound')}
        backLabel={t('nav.devTools')}
        onBack={close}
        sections={
          detail
            ? [
                {
                  title: t('devt.basic'),
                  items: [
                    { label: t('devt.col.name'), value: <CopyText value={detail.name} /> },
                    { label: t('devt.col.mode'), value: <ModeBadge mode={detail.mode} /> },
                    { label: t('devt.col.source'), value: t(`devt.source.${detail.source}`) },
                    { label: t('devt.col.group'), value: detail.group },
                    {
                      label: t('devt.col.endpoint'),
                      value: detail.endpoint ? (
                        <span className="id-mono">{detail.endpoint}</span>
                      ) : null,
                    },
                    {
                      label: t('devt.col.perms'),
                      value: detail.permissions.length
                        ? detail.permissions.map(permissionLabel).join(', ')
                        : t('devt.everyone'),
                    },
                    {
                      label: t('devt.visibility'),
                      value: detail.deferred ? t('devt.deferred') : t('devt.always'),
                    },
                    { label: t('devt.col.calls'), value: String(detail.calls30d) },
                    {
                      label: t('devt.col.lastUsed'),
                      value: detail.lastUsedAt ? fmtDateTime(detail.lastUsedAt) : null,
                    },
                    {
                      label: t('devt.desc'),
                      wide: true,
                      value: <div className={styles.desc}>{detail.description}</div>,
                    },
                  ],
                },
              ]
            : []
        }
      >
        {detail && (
          <>
            <Params schema={detail.inputSchema} />
            <TestRun tool={detail} allowed={can('*') || detail.permissions.every((p) => can(p))} />
          </>
        )}
      </RecordDetail>
    );
  }

  const nRead = tools.filter((x) => x.mode === 'READ').length;
  return (
    <ListPage fit title={t('nav.devTools')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        fit
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        onSearch={setQ}
        toolbarActions={
          <span className={styles.muted}>
            {t('devt.stats', { v0: tools.length, v1: nRead, v2: tools.length - nRead })}
          </span>
        }
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => open(String(r.id))}
      />
    </ListPage>
  );
}

/** 입력값 표 — 스키마의 칸마다 이름·형식·필수·설명 */
function Params({ schema }: { schema: JsonSchema }) {
  const { t } = useTranslation();
  const props = Object.entries(schema.properties ?? {});
  const req = new Set(schema.required ?? []);
  return (
    <PageCard title={t('devt.params')}>
      {props.length ? (
        <table className={styles.params}>
          <thead>
            <tr>
              <th>{t('devt.paramName')}</th>
              <th>{t('devt.paramType')}</th>
              <th>{t('devt.paramRequired')}</th>
              <th>{t('devt.paramDesc')}</th>
            </tr>
          </thead>
          <tbody>
            {props.map(([k, p]) => (
              <tr key={k}>
                <td className="id-mono">{k}</td>
                <td className="id-mono">{typeOf(p)}</td>
                <td>{req.has(k) ? t('devt.required') : ''}</td>
                <td>{p.description ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.muted}>{t('devt.noParams')}</p>
      )}
    </PageCard>
  );
}

/** 시험 실행 — 조회 도구만, 내 권한으로 */
function TestRun({ tool, allowed }: { tool: Tool; allowed: boolean }) {
  const { t } = useTranslation();
  const [input, setInput] = useState(() => sampleInput(tool.inputSchema));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RunResult | null>(null);
  const [err, setErr] = useState('');
  const blocked = tool.mode !== 'READ' ? t('devt.writeBlocked') : !allowed ? t('devt.noPerm') : '';

  const run = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input || '{}');
    } catch {
      setErr(t('devt.badJson'));
      return;
    }
    setErr('');
    setBusy(true);
    try {
      setRes(
        await api<RunResult>(`/dev/tools/${encodeURIComponent(tool.name)}/run`, {
          method: 'POST',
          body: JSON.stringify({ input: parsed }),
        }),
      );
    } catch (e) {
      setRes({ ok: false, ms: 0, error: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageCard
      title={t('devt.test')}
      actions={
        !blocked && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInput(sampleInput(tool.inputSchema))}
              disabled={busy}
            >
              <RotateCcw size={14} aria-hidden /> {t('devt.reset')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void run()} disabled={busy}>
              <Play size={14} aria-hidden /> {busy ? t('devt.running') : t('devt.run')}
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <p className={styles.muted}>{blocked}</p>
      ) : (
        <div className={styles.test}>
          <label className={styles.field}>
            <span>{t('devt.testInput')}</span>
            <Textarea
              value={input}
              rows={6}
              spellCheck={false}
              className={styles.code}
              onChange={(e) => setInput(e.target.value)}
            />
            {err && <small className={styles.err}>{err}</small>}
          </label>
          {res && (
            <div className={styles.field}>
              <span>
                {t('devt.result')}{' '}
                <Badge variant="subtle" color={res.ok ? 'success' : 'error'}>
                  {res.ok ? t('devt.ok', { v0: res.ms }) : t('devt.fail', { v0: res.ms })}
                </Badge>
              </span>
              <pre className={styles.result}>
                {res.ok ? JSON.stringify(res.result, null, 2) : res.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </PageCard>
  );
}
