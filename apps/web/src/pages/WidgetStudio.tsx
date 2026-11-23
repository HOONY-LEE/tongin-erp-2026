import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Input, Select } from '@sunghoon_lee/akron-ui';
import { Calendar, Hash, MapPin, Plus, Sparkles, Store, Tag, Trash2, X } from 'lucide-react';
import {
  DASH_COLS,
  DASH_PERIODS,
  DASH_ROW_HEIGHT,
  STUDIO_DATASETS,
  STUDIO_DATASET_MAP,
  STUDIO_GRAINS,
  STUDIO_VIZ,
  STUDIO_VIZ_GROUPS,
  normalizeStudioSpec,
  type CustomWidgetRow,
  type StudioControl,
  type StudioDimKind,
  type StudioParams,
  type StudioProposal,
  type StudioResult,
  type StudioSpec,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { fmtDateTime } from '../lib/dateFormat';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  ConfirmModal,
  DataTable,
  PageCard,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Textarea,
  useToast,
  type Column,
} from '../components/ui';
import { StudioWidget } from '../components/dashboard/studio/StudioWidget';
import {
  dimLabel,
  dsLabel,
  fieldLabel,
  grainLabel,
  measureLabel,
  optLabel,
} from '../components/dashboard/studio/studioLabels';
import { DASH_PERIOD_LABEL, DASH_VIZ_LABEL } from '../i18n/codes';
import { tDyn } from '../i18n';
import styles from './WidgetStudio.module.css';

const BACK = '/dashboard-admin';
const LIST = '/dashboard-admin/widgets';

const DIM_ICON: Record<StudioDimKind, typeof Tag> = {
  cat: Tag,
  time: Calendar,
  geo: MapPin,
  org: Store,
};

/** 처음 만들 때 — 접수 건수 월간 추이 */
const STARTER: StudioSpec = {
  ...normalizeStudioSpec({
    title: '',
    dataset: 'lead',
    measure: 'count',
    dimension: 'createdAt',
    grain: 'month',
    viz: 'line',
    period: '12m',
  }).spec,
  title: '',
};

/** 위젯 스튜디오 — /dashboard-admin/widgets(목록), /new·/:wid(만들기·고치기) */
export default function WidgetStudio() {
  const { wid } = useParams();
  return wid ? <Studio id={wid === 'new' ? null : wid} /> : <WidgetList />;
}

// ═══════════ 목록 ═══════════
function WidgetList() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [rows, setRows] = useState<CustomWidgetRow[] | null>(null);
  const load = useCallback(async () => {
    try {
      setRows(await api<CustomWidgetRow[]>('/custom-widgets'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.loadFailed') });
      setRows([]);
    }
  }, [toast, t]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column[] = [
    {
      title: t('studio.col.title'),
      minWidth: 240,
      flex: 1,
      render: (r) => (
        <div className={styles.nameCell}>
          <b>{String(r.title)}</b>
          {r.subtitle ? <small>{String(r.subtitle)}</small> : null}
        </div>
      ),
    },
    { title: t('studio.col.dataset'), dataIndex: 'datasetText', width: 140 },
    { title: t('studio.col.viz'), dataIndex: 'vizText', width: 110 },
    { title: t('studio.col.by'), dataIndex: 'byText', width: 110 },
    { title: t('studio.col.updated'), dataIndex: 'updatedText', width: 160 },
  ];
  const tableRows = (rows ?? []).map((r) => ({
    ...r,
    datasetText: dsLabel(r.spec.dataset),
    vizText: DASH_VIZ_LABEL[r.spec.viz] ?? r.spec.viz,
    byText: r.createdByName ?? '',
    updatedText: fmtDateTime(r.updatedAt),
  }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('studio.listTitle')}
        breadcrumbs={[{ label: t('dash.manage'), onClick: () => navigate(BACK) }]}
        onRefresh={load}
      />
      <DataTable
        columns={columns}
        rows={tableRows as never}
        loading={rows === null}
        onRowClick={(r) => navigate(`${LIST}/${String(r.id)}`)}
        toolbarActions={
          can('DASHBOARD.CREATE') ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => navigate(`${LIST}/new`)}
            >
              {t('studio.newWidget')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

// ═══════════ 스튜디오 ═══════════
function Studio({ id }: { id: string | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [spec, setSpecRaw] = useState<StudioSpec | null>(id ? null : STARTER);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const canSave = id ? can('DASHBOARD.UPDATE') : can('DASHBOARD.CREATE');
  const canAi = can('DASHBOARD.CREATE');

  /** 고칠 때마다 카탈로그로 다시 맞춘다(없는 칸·안 맞는 조작은 빠진다) */
  // 제목·부제는 치는 그대로 둔다(비워도 '새 위젯'으로 되돌아가지 않게 — 저장할 때 채운다)
  const setSpec = useCallback(
    (next: StudioSpec) =>
      setSpecRaw({
        ...normalizeStudioSpec(next).spec,
        title: next.title ?? '',
        subtitle: next.subtitle,
      }),
    [],
  );
  const patch = (p: Partial<StudioSpec>) => spec && setSpec({ ...spec, ...p });

  useEffect(() => {
    if (!id) return;
    api<CustomWidgetRow>(`/custom-widgets/${id}`)
      .then((r) => {
        setSpecRaw(r.spec);
        setPrompt(r.prompt ?? '');
      })
      .catch((e) => {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.loadFailed') });
        navigate(LIST, { replace: true });
      });
  }, [id, navigate, toast, t]);

  const save = async () => {
    if (!spec) return;
    const body = { spec: { ...spec, title: spec.title.trim() || t('studio.newWidget') }, prompt };
    setBusy(true);
    try {
      const r = await api<CustomWidgetRow>(id ? `/custom-widgets/${id}` : '/custom-widgets', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      toast({ type: 'success', title: t('studio.saved') });
      if (!id) navigate(`${LIST}/${r.id}`, { replace: true });
      else setSpecRaw(r.spec);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.saveFailed') });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/custom-widgets/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('studio.deleted') });
      navigate(LIST, { replace: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.saveFailed') });
    } finally {
      setBusy(false);
      setConfirmDel(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={spec?.title || t('studio.title')}
        breadcrumbs={[
          { label: t('dash.manage'), onClick: () => navigate(BACK) },
          { label: t('studio.listTitle'), onClick: () => navigate(LIST) },
        ]}
        actions={
          <>
            {id && can('DASHBOARD.DELETE') && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Trash2 size={14} />}
                onClick={() => setConfirmDel(true)}
                disabled={busy}
              >
                {t('studio.delete')}
              </Button>
            )}
            {canSave && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void save()}
                disabled={busy || !spec}
              >
                {t('studio.save')}
              </Button>
            )}
          </>
        }
      />
      {!spec ? (
        <Skeleton height={480} radius={12} />
      ) : (
        <div className={styles.grid}>
          <div className={styles.left}>
            <AiPanel
              prompt={prompt}
              setPrompt={setPrompt}
              current={id ? spec : null}
              enabled={canAi}
              onPick={(s) => setSpec(s)}
            />
            <EditPanel spec={spec} patch={patch} />
            <CatalogPanel spec={spec} patch={patch} />
          </div>
          <PreviewPanel spec={spec} />
        </div>
      )}
      <ConfirmModal
        open={confirmDel}
        title={t('studio.deleteTitle')}
        message={t('studio.deleteMsg')}
        confirmLabel={t('studio.delete')}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDel(false)}
      />
    </div>
  );
}

// ── AI 제안 ──
interface ProposeResult {
  summary: string;
  proposals: StudioProposal[];
  questions: string[];
}
function AiPanel({
  prompt,
  setPrompt,
  current,
  enabled,
  onPick,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  /** 저장된 위젯을 고칠 때 — AI가 이걸 고친 안을 첫 번째로 낸다 */
  current: StudioSpec | null;
  enabled: boolean;
  onPick: (s: StudioSpec) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ProposeResult | null>(null);
  const [picked, setPicked] = useState(-1);
  const ask = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const r = await api<ProposeResult>('/custom-widgets/propose', {
        method: 'POST',
        body: JSON.stringify({ prompt, ...(current ? { current } : {}) }),
      });
      setRes(r);
      // 추천안을 바로 미리보기로
      setPicked(0);
      onPick(r.proposals[0].spec);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.ai.failed') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageCard
      title={
        <span className={styles.cardTitle}>
          <Sparkles size={15} aria-hidden /> {t('studio.ai.title')}
        </span>
      }
    >
      {!enabled ? (
        <p className={styles.muted}>{t('studio.ai.noPerm')}</p>
      ) : (
        <div className={styles.ai}>
          <Textarea
            value={prompt}
            rows={4}
            maxLength={2000}
            placeholder={t('studio.ai.ph')}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask();
            }}
          />
          <div className={styles.aiBar}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Sparkles size={14} />}
              onClick={() => void ask()}
              disabled={busy || !prompt.trim()}
            >
              {current ? t('studio.ai.refine') : t('studio.ai.ask')}
            </Button>
          </div>
          {busy && (
            <div className={styles.thinking}>
              <Skeleton height={14} width="70%" />
              <span>{t('studio.ai.asking')}</span>
            </div>
          )}
          {res && !busy && (
            <>
              {res.summary && <p className={styles.summary}>{res.summary}</p>}
              <div className={styles.proposals}>
                {res.proposals.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`${styles.proposal} ${picked === i ? styles.picked : ''}`}
                    onClick={() => {
                      setPicked(i);
                      onPick(p.spec);
                    }}
                  >
                    <span className={styles.proposalHead}>
                      <b>{p.name}</b>
                      {i === 0 && (
                        <Badge variant="subtle" color="primary">
                          {t('studio.ai.recommended')}
                        </Badge>
                      )}
                    </span>
                    <span className={styles.proposalWhy}>{p.why}</span>
                    <span className={styles.tags}>
                      <span>{dsLabel(p.spec.dataset)}</span>
                      <span>{measureLabel(p.spec.dataset, p.spec.measure)}</span>
                      {p.spec.dimension && (
                        <span>{dimLabel(p.spec.dataset, p.spec.dimension)}</span>
                      )}
                      <span>{DASH_VIZ_LABEL[p.spec.viz]}</span>
                      {(p.spec.controls ?? []).map((c, k) => (
                        <span key={k} className={styles.tagCtl}>
                          {c.kind === 'filter'
                            ? `${t('studio.edit.filter')} · ${dimLabel(p.spec.dataset, c.dim)}`
                            : `${c.kind === 'segment' ? t('studio.edit.segment') : t('studio.edit.dropdown')} · ${t(`studio.target.${c.target}`)}`}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
              {res.questions.length > 0 && (
                <div className={styles.questions}>
                  <span>{t('studio.ai.questions')}</span>
                  <ul>
                    {res.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </PageCard>
  );
}

// ── 직접 고치기 ──
type SelectCtl = Extract<StudioControl, { kind: 'segment' | 'dropdown' }>;
function EditPanel({ spec, patch }: { spec: StudioSpec; patch: (p: Partial<StudioSpec>) => void }) {
  const { t } = useTranslation();
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  const dimIsTime = ds.dimensions.find((d) => d.key === spec.dimension)?.kind === 'time';
  const controls = spec.controls ?? [];
  const setControls = (c: StudioControl[]) => patch({ controls: c });
  const has = (target: string) =>
    controls.some((c) => c.kind !== 'filter' && (c as SelectCtl).target === target);

  const addCtl = (kind: 'grain' | 'dimension' | 'measure' | 'period' | 'filter') => {
    if (kind === 'filter') {
      const dim = ds.dimensions.find(
        (d) => d.kind !== 'time' && !controls.some((c) => c.kind === 'filter' && c.dim === d.key),
      );
      if (dim) setControls([...controls, { kind: 'filter', dim: dim.key }]);
      return;
    }
    const options =
      kind === 'grain'
        ? ['week', 'month', 'year']
        : kind === 'dimension'
          ? [
              ...new Set([
                ...(spec.dimension ? [spec.dimension] : []),
                ...ds.dimensions.filter((d) => d.kind !== 'time').map((d) => d.key),
              ]),
            ].slice(0, 4)
          : kind === 'measure'
            ? ds.measures.map((m) => m.key)
            : ['30d', '90d', '12m'];
    setControls([
      ...controls,
      { kind: kind === 'period' ? 'dropdown' : 'segment', target: kind, options },
    ]);
  };
  const updateCtl = (i: number, c: StudioControl) =>
    setControls(controls.map((x, k) => (k === i ? c : x)));

  const optionPool = (c: SelectCtl): string[] =>
    c.target === 'grain'
      ? [...STUDIO_GRAINS]
      : c.target === 'dimension'
        ? ds.dimensions.map((d) => d.key)
        : c.target === 'measure'
          ? ds.measures.map((m) => m.key)
          : c.target === 'period'
            ? [...DASH_PERIODS]
            : [...STUDIO_VIZ];

  return (
    <PageCard title={t('studio.edit.title')}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span>{t('studio.edit.name')}</span>
          <Input
            value={spec.title}
            maxLength={60}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('studio.edit.subtitle')}</span>
          <Input
            value={spec.subtitle ?? ''}
            maxLength={120}
            onChange={(e) => patch({ subtitle: e.target.value || undefined })}
          />
        </label>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>{t('studio.edit.dataset')}</span>
            <Select
              value={spec.dataset}
              onValueChange={(v) => {
                const next = STUDIO_DATASET_MAP.get(v)!;
                patch({
                  dataset: v,
                  measure: next.measures[0].key,
                  dimension: next.defaultTime,
                  split: null,
                  filters: [],
                  controls: [],
                  periodField: undefined,
                });
              }}
              options={STUDIO_DATASETS.map((d) => ({ value: d.key, label: dsLabel(d.key) }))}
            />
          </label>
          <label className={styles.field}>
            <span>{t('studio.edit.measure')}</span>
            <Select
              value={spec.measure}
              onValueChange={(v) => patch({ measure: v })}
              options={ds.measures.map((m) => ({
                value: m.key,
                label: measureLabel(ds.key, m.key),
              }))}
            />
          </label>
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>{t('studio.edit.dimension')}</span>
            <Select
              value={spec.dimension ?? '__none'}
              onValueChange={(v) => patch({ dimension: v === '__none' ? null : v })}
              options={[
                { value: '__none', label: t('studio.edit.none') },
                ...ds.dimensions.map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) })),
              ]}
            />
          </label>
          {dimIsTime ? (
            <label className={styles.field}>
              <span>{t('studio.edit.grain')}</span>
              <Select
                value={spec.grain ?? 'month'}
                onValueChange={(v) => patch({ grain: v as StudioSpec['grain'] })}
                options={STUDIO_GRAINS.map((g) => ({ value: g, label: grainLabel(g) }))}
              />
            </label>
          ) : (
            <label className={styles.field}>
              <span>{t('studio.edit.split')}</span>
              <Select
                value={spec.split ?? '__none'}
                onValueChange={(v) => patch({ split: v === '__none' ? null : v })}
                options={[
                  { value: '__none', label: t('studio.edit.splitNone') },
                  ...ds.dimensions
                    .filter((d) => d.key !== spec.dimension)
                    .map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) })),
                ]}
              />
            </label>
          )}
        </div>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>{t('studio.edit.viz')}</span>
            <Select
              value={spec.viz}
              onValueChange={(v) => patch({ viz: v as StudioSpec['viz'] })}
              options={STUDIO_VIZ_GROUPS.flatMap((g) =>
                g.viz
                  // 분포는 건별 숫자 칸이 있는 데이터만, 산점도는 숫자가 두 개 이상일 때만
                  .filter((v) =>
                    v === 'histogram' || v === 'box'
                      ? ds.fields.length > 0
                      : v === 'scatter'
                        ? ds.measures.length > 1
                        : true,
                  )
                  .map((v) => ({
                    value: v,
                    label: `${tDyn(`studio.vizGroup.${g.key}`, g.label)} · ${DASH_VIZ_LABEL[v]}`,
                  })),
              )}
            />
          </label>
          <label className={styles.field}>
            <span>{t('studio.edit.period')}</span>
            <Select
              value={spec.period}
              onValueChange={(v) => patch({ period: v as StudioSpec['period'] })}
              options={DASH_PERIODS.map((p) => ({ value: p, label: DASH_PERIOD_LABEL[p] }))}
            />
          </label>
        </div>

        {spec.viz === 'scatter' && (
          <label className={styles.field}>
            <span>{t('studio.edit.measure2')}</span>
            <Select
              value={spec.measure2 ?? ''}
              onValueChange={(v) => patch({ measure2: v })}
              options={ds.measures
                .filter((m) => m.key !== spec.measure)
                .map((m) => ({ value: m.key, label: measureLabel(ds.key, m.key) }))}
            />
          </label>
        )}
        {(spec.viz === 'histogram' || spec.viz === 'box') && (
          <label className={styles.field}>
            <span>{t('studio.edit.field')}</span>
            <Select
              value={spec.field ?? ''}
              onValueChange={(v) => patch({ field: v })}
              options={ds.fields.map((f) => ({ value: f.key, label: fieldLabel(ds.key, f.key) }))}
            />
          </label>
        )}
        <div className={styles.field}>
          <span>{t('studio.edit.controls')}</span>
          {!controls.length && <p className={styles.muted}>{t('studio.edit.noControls')}</p>}
          {controls.map((c, i) => (
            <div key={i} className={styles.ctl}>
              {c.kind === 'filter' ? (
                <>
                  <Badge variant="subtle" color="neutral">
                    {t('studio.edit.filter')}
                  </Badge>
                  <Select
                    size="sm"
                    value={c.dim}
                    onValueChange={(v) => updateCtl(i, { ...c, dim: v })}
                    options={ds.dimensions
                      .filter((d) => d.kind !== 'time')
                      .map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) }))}
                    aria-label={t('studio.edit.filterDim')}
                  />
                </>
              ) : (
                <>
                  <SegmentedControl
                    size="sm"
                    value={c.kind}
                    onChange={(v) => updateCtl(i, { ...c, kind: v as SelectCtl['kind'] })}
                    options={[
                      { value: 'segment', label: t('studio.edit.segment') },
                      { value: 'dropdown', label: t('studio.edit.dropdown') },
                    ]}
                  />
                  <span className={styles.ctlTarget}>{t(`studio.target.${c.target}`)}</span>
                  <span className={styles.ctlOpts}>
                    {optionPool(c).map((o) => {
                      const on = c.options.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                          aria-pressed={on}
                          onClick={() =>
                            updateCtl(i, {
                              ...c,
                              options: on
                                ? c.options.filter((x) => x !== o)
                                : optionPool(c).filter((x) => x === o || c.options.includes(x)),
                            })
                          }
                        >
                          {optLabel(ds.key, c.target, o)}
                        </button>
                      );
                    })}
                  </span>
                </>
              )}
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={t('studio.edit.remove')}
                onClick={() => setControls(controls.filter((_, k) => k !== i))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {controls.length < 4 && (
            <div className={styles.addRow}>
              {!has('grain') && dimIsTime && (
                <button type="button" className={styles.add} onClick={() => addCtl('grain')}>
                  {t('studio.edit.addGrain')}
                </button>
              )}
              {!has('dimension') && (
                <button type="button" className={styles.add} onClick={() => addCtl('dimension')}>
                  {t('studio.edit.addDimension')}
                </button>
              )}
              {!has('measure') && ds.measures.length > 1 && (
                <button type="button" className={styles.add} onClick={() => addCtl('measure')}>
                  {t('studio.edit.addMeasure')}
                </button>
              )}
              {!has('period') && (
                <button type="button" className={styles.add} onClick={() => addCtl('period')}>
                  {t('studio.edit.addPeriod')}
                </button>
              )}
              <button type="button" className={styles.add} onClick={() => addCtl('filter')}>
                {t('studio.edit.addFilter')}
              </button>
            </div>
          )}
        </div>
      </div>
    </PageCard>
  );
}

// ── 쓸 수 있는 데이터(측정값·차원) ──
function CatalogPanel({
  spec,
  patch,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
}) {
  const { t } = useTranslation();
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  return (
    <PageCard title={t('studio.catalog.title')}>
      <p className={styles.muted}>{t('studio.catalog.hint')}</p>
      <div className={styles.catGroup}>
        <span className={styles.catHead}>{t('studio.catalog.measures')}</span>
        <div className={styles.pills}>
          {ds.measures.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.pill} ${styles.measure} ${spec.measure === m.key ? styles.pillOn : ''}`}
              onClick={() => patch({ measure: m.key })}
              title={m.description}
            >
              <Hash size={12} aria-hidden /> {measureLabel(ds.key, m.key)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.catGroup}>
        <span className={styles.catHead}>{t('studio.catalog.dimensions')}</span>
        <div className={styles.pills}>
          {ds.dimensions.map((d) => {
            const I = DIM_ICON[d.kind];
            return (
              <button
                key={d.key}
                type="button"
                className={`${styles.pill} ${styles.dimension} ${spec.dimension === d.key ? styles.pillOn : ''}`}
                onClick={() => patch({ dimension: d.key })}
              >
                <I size={12} aria-hidden /> {dimLabel(ds.key, d.key)}
              </button>
            );
          })}
        </div>
      </div>
    </PageCard>
  );
}

// ── 미리보기 ──
const SIZES = { s: 4, m: 6, l: 12 } as const;
function PreviewPanel({ spec }: { spec: StudioSpec }) {
  const { t } = useTranslation();
  const [size, setSize] = useState<keyof typeof SIZES>('m');
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 실제 대시보드 칸과 같은 비율 — 12칸 중 몇 칸, 높이 4줄
  const w = Math.max(280, Math.round((boxW * SIZES[size]) / DASH_COLS));
  const h = (spec.viz === 'card' || spec.viz === 'gauge' ? 2 : 4) * DASH_ROW_HEIGHT + 16;
  const load = useCallback(
    (params: StudioParams) =>
      api<StudioResult>('/custom-widgets/preview', {
        method: 'POST',
        body: JSON.stringify({ spec, params }),
      }),
    [spec],
  );
  const preview = useMemo(() => spec, [spec]);
  return (
    <div className={styles.right}>
      <PageCard
        title={t('studio.preview.title')}
        actions={
          <SegmentedControl
            size="sm"
            value={size}
            onChange={(v) => setSize(v as keyof typeof SIZES)}
            options={[
              { value: 's', label: t('studio.preview.s') },
              { value: 'm', label: t('studio.preview.m') },
              { value: 'l', label: t('studio.preview.l') },
            ]}
          />
        }
      >
        <div ref={boxRef} className={styles.stage}>
          <section className={styles.frame} style={{ width: Math.min(w, boxW || w), height: h }}>
            <div className={styles.frameHead}>{spec.title || t('studio.newWidget')}</div>
            <div className={styles.frameBody}>
              <StudioWidget spec={preview} load={load} />
            </div>
          </section>
        </div>
        <p className={styles.note}>{t('studio.preview.scopeNote')}</p>
      </PageCard>
    </div>
  );
}
