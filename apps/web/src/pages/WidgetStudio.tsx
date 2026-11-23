import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Input, Select } from '@sunghoon_lee/akron-ui';
import {
  ArrowLeft,
  ArrowUp,
  Calendar,
  Hash,
  MapPin,
  Plus,
  Ruler,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  DASH_COLS,
  DASH_PERIODS,
  DASH_ROW_HEIGHT,
  STUDIO_DATASETS,
  STUDIO_DATASET_MAP,
  STUDIO_GRAINS,
  STUDIO_PLACES,
  STUDIO_VIZ,
  STUDIO_VIZ_GROUPS,
  normalizeStudioSpec,
  type CustomWidgetRow,
  type StudioControl,
  type StudioDataset,
  type StudioDimKind,
  type StudioParams,
  type StudioPlace,
  type StudioProposal,
  type StudioResult,
  type StudioSpec,
  type StudioViz,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/dateFormat';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  ConfirmModal,
  DataTable,
  ListToolbar,
  SegmentedControl,
  Skeleton,
  useToast,
  type Column,
} from '../components/ui';
import { StudioWidget } from '../components/dashboard/studio/StudioWidget';
import { VIZ_ICON } from '../components/dashboard/builder/DashboardEditor';
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
import builder from '../components/dashboard/builder/builder.module.css';

/** 만든 위젯 목록은 대시보드 관리의 '위젯' 탭 */
const LIST_TAB = '/dashboard-admin?tab=widgets';
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
    dataset: 'lead',
    measure: 'count',
    dimension: 'createdAt',
    grain: 'month',
    viz: 'line',
    period: '12m',
  }).spec,
  title: '',
};

/** 이 데이터로 쓸 수 있는 차트인가 — 분포는 건별 숫자 칸, 산점도는 숫자 두 개 */
const vizOk = (ds: StudioDataset, v: StudioViz) =>
  v === 'histogram' || v === 'box'
    ? ds.fields.length > 0
    : v === 'scatter'
      ? ds.measures.length > 1
      : true;

/** 기준(차원) 없이 그리는 차트 — 숫자 하나·게이지·히스토그램(건별 값의 분포) */
const NO_DIM_VIZ: StudioViz[] = ['card', 'gauge', 'histogram'];

/** 지금 고른 기준으로 그릴 수 있는 차트인가 — 기준이 없으면 숫자 카드류만, 있으면 그 반대 */
const vizFits = (ds: StudioDataset, dimension: string | null | undefined, v: StudioViz) => {
  if (!vizOk(ds, v)) return false;
  const dim = dimension ? ds.dimensions.find((d) => d.key === dimension) : undefined;
  if (!dim) return NO_DIM_VIZ.includes(v);
  if (NO_DIM_VIZ.includes(v)) return false;
  if (v === 'line' || v === 'area') return dim.kind === 'time';
  if (v === 'map') return dim.kind === 'geo';
  return true;
};

/** 기준을 바꿀 때 차트가 안 맞으면 맞는 것으로 — 없음→숫자 카드, 날짜→선, 지역→지도, 그 밖→막대 */
const fitViz = (ds: StudioDataset, dimension: string | null, v: StudioViz): StudioViz => {
  if (vizFits(ds, dimension, v)) return v;
  if (!dimension) return 'card';
  const kind = ds.dimensions.find((d) => d.key === dimension)?.kind;
  return kind === 'time' ? 'line' : kind === 'geo' ? 'map' : 'bar';
};

/** 위젯 스튜디오 — /dashboard-admin/widgets(목록), /new·/:wid(만들기·고치기) */
export default function WidgetStudio() {
  const { wid } = useParams();
  const navigate = useNavigate();
  // 목록 주소로 오면 대시보드 관리의 '위젯' 탭으로
  useEffect(() => {
    if (!wid) navigate(LIST_TAB, { replace: true });
  }, [wid, navigate]);
  return wid ? <Studio id={wid === 'new' ? null : wid} /> : null;
}

// ═══════════ 목록(대시보드 관리 '위젯' 탭 안에 들어간다) ═══════════
export function WidgetList({
  reloadKey = 0,
  view = 'list',
  viewSwitch,
}: {
  reloadKey?: number;
  /** 대시보드 탭과 같은 카드/목록 보기 */
  view?: 'card' | 'list';
  viewSwitch?: React.ReactNode;
}) {
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
  }, [load, reloadKey]);

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
  const canCreate = can('DASHBOARD.CREATE');
  const open = (id: string) => navigate(`${LIST}/${id}`);
  const createButton = canCreate ? (
    <Button
      variant="primary"
      size="sm"
      leftIcon={<Plus size={14} />}
      onClick={() => navigate(`${LIST}/new`)}
    >
      {t('studio.newWidget')}
    </Button>
  ) : undefined;
  if (view === 'list' || rows === null)
    return (
      <DataTable
        columns={columns}
        rows={tableRows as never}
        loading={rows === null}
        onRowClick={(r) => open(String(r.id))}
        viewSwitch={viewSwitch}
        toolbarActions={createButton}
      />
    );
  return (
    <>
      <ListToolbar viewSwitch={viewSwitch} actions={createButton} />
      <div className={builder.cardGrid}>
        {tableRows.map((r) => (
          <article
            key={r.id}
            className={builder.tplCard}
            onClick={() => open(r.id)}
            aria-label={r.title}
          >
            {/* 실제 데이터로 그린 작은 미리보기 — 누르기만 하면 스튜디오로 */}
            <div className={`${builder.tplPreview} ${styles.cardPreview}`}>
              <StudioWidget
                spec={r.spec}
                showSubtitle={false}
                chartOnly
                load={(params) =>
                  api<StudioResult>(`/custom-widgets/${r.id}/data`, {
                    method: 'POST',
                    body: JSON.stringify({ params }),
                  })
                }
              />
            </div>
            <div className={builder.tplBody}>
              <span className={builder.tplName}>{r.title}</span>
              <span className={builder.tplDesc}>{r.subtitle || t('dash.noDesc')}</span>
              <div className={builder.tplTags}>
                <Badge variant="subtle" color="neutral" size="sm">
                  {r.datasetText}
                </Badge>
                <Badge variant="subtle" color="primary" size="sm">
                  {r.vizText}
                </Badge>
              </div>
              <div className={builder.tplFoot}>
                {r.byText ? `${r.byText} · ` : ''}
                {fmtDate(r.updatedAt)}
              </div>
            </div>
          </article>
        ))}
        {canCreate && (
          <button type="button" className={builder.newCard} onClick={() => navigate(`${LIST}/new`)}>
            <Plus size={22} />
            {t('studio.newWidget')}
          </button>
        )}
      </div>
    </>
  );
}

// ═══════════ 양쪽 판 너비 — 경계선을 끌어 조절, 브라우저에 기억 ═══════════
const PANE_MIN = 220;
const PANE_MAX = 640;
const clampW = (w: number) => Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, w)));
function usePaneWidth(side: 'left' | 'right', initial: number) {
  const key = `tongin_studio_pane_${side}`;
  const [w, setW] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return v ? clampW(v) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: number) => {
      const c = clampW(v);
      setW(c);
      try {
        localStorage.setItem(key, String(c));
      } catch {
        // 저장이 막힌 브라우저 — 이번 화면에서만
      }
    },
    [key],
  );
  return [w, set] as const;
}

function PaneResizer({
  side,
  width,
  onChange,
}: {
  side: 'left' | 'right';
  width: number;
  onChange: (w: number) => void;
}) {
  const { t } = useTranslation();
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (ev: PointerEvent) =>
      onChange(side === 'left' ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('studio.resizePane')}
      tabIndex={0}
      className={`${styles.resizer} ${side === 'left' ? styles.resizerLeft : styles.resizerRight}`}
      onPointerDown={start}
      onDoubleClick={() => onChange(side === 'left' ? 300 : 360)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(width + (side === 'left' ? -16 : 16));
        if (e.key === 'ArrowRight') onChange(width + (side === 'left' ? 16 : -16));
      }}
    />
  );
}

// ═══════════ 스튜디오 — 왼쪽 설정 · 가운데 미리보기 · 오른쪽 AI ═══════════
function Studio({ id }: { id: string | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [spec, setSpecRaw] = useState<StudioSpec | null>(id ? null : STARTER);
  const [lastPrompt, setLastPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const canSave = id ? can('DASHBOARD.UPDATE') : can('DASHBOARD.CREATE');
  const [leftW, setLeftW] = usePaneWidth('left', 300);
  const [rightW, setRightW] = usePaneWidth('right', 360);

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
        setLastPrompt(r.prompt ?? '');
      })
      .catch((e) => {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.loadFailed') });
        navigate(LIST_TAB, { replace: true });
      });
  }, [id, navigate, toast, t]);

  const save = async () => {
    if (!spec) return;
    const body = {
      spec: { ...spec, title: spec.title.trim() || t('studio.newWidget') },
      prompt: lastPrompt,
    };
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
      navigate(LIST_TAB, { replace: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('studio.saveFailed') });
    } finally {
      setBusy(false);
      setConfirmDel(false);
    }
  };

  return (
    <div className={styles.studio}>
      <header className={styles.bar}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => navigate(LIST_TAB)}
          aria-label={t('studio.listTitle')}
          title={t('studio.listTitle')}
        >
          <ArrowLeft size={16} />
        </button>
        <span className={styles.crumb}>{t('studio.title')}</span>
        <span className={styles.crumbSep}>/</span>
        <input
          className={styles.titleInput}
          value={spec?.title ?? ''}
          maxLength={60}
          placeholder={t('studio.newWidget')}
          onChange={(e) => patch({ title: e.target.value })}
          aria-label={t('studio.edit.name')}
        />
        <span className={styles.spacer} />
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
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !spec}>
            {t('studio.save')}
          </Button>
        )}
      </header>
      {!spec ? (
        <div className={styles.loading}>
          <Skeleton height="100%" radius={12} />
        </div>
      ) : (
        <div
          className={styles.panes}
          style={{ gridTemplateColumns: `${leftW}px minmax(0, 1fr) ${rightW}px` }}
        >
          <aside className={styles.left}>
            <SettingsPane spec={spec} patch={patch} />
            <PaneResizer side="left" width={leftW} onChange={setLeftW} />
          </aside>
          <main className={styles.center}>
            <PreviewCanvas spec={spec} />
          </main>
          <aside className={styles.right}>
            <PaneResizer side="right" width={rightW} onChange={setRightW} />
            <AiChat
              spec={spec}
              enabled={can('DASHBOARD.CREATE')}
              onApply={setSpec}
              onAsk={setLastPrompt}
            />
          </aside>
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

// ═══════════ 왼쪽 — 직접 설정(태블로처럼: 데이터 → 차트 → 구성 → 조작 요소) ═══════════
type SelectCtl = Extract<StudioControl, { kind: 'segment' | 'dropdown' }>;
function SettingsPane({
  spec,
  patch,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
}) {
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
    <div className={styles.paneScroll}>
      {/* 데이터 — 측정값(초록)·차원(파랑)·분포 칸(보라) */}
      <section className={styles.section}>
        <h3>{t('studio.edit.dataset')}</h3>
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
              field: undefined,
              measure2: undefined,
              viz: fitViz(next, next.defaultTime, spec.viz),
            });
          }}
          options={STUDIO_DATASETS.map((d) => ({ value: d.key, label: dsLabel(d.key) }))}
        />
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
        <span className={styles.catHead}>{t('studio.catalog.dimensions')}</span>
        <div className={styles.pills}>
          {ds.dimensions.map((d) => {
            const I = DIM_ICON[d.kind];
            return (
              <button
                key={d.key}
                type="button"
                className={`${styles.pill} ${styles.dimension} ${spec.dimension === d.key ? styles.pillOn : ''}`}
                onClick={() => {
                  const dim = spec.dimension === d.key ? null : d.key;
                  patch({ dimension: dim, viz: fitViz(ds, dim, spec.viz) });
                }}
              >
                <I size={12} aria-hidden /> {dimLabel(ds.key, d.key)}
              </button>
            );
          })}
        </div>
        {ds.fields.length > 0 && (
          <>
            <span className={styles.catHead}>{t('studio.catalog.fields')}</span>
            <div className={styles.pills}>
              {ds.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`${styles.pill} ${styles.fieldPill} ${
                    (spec.viz === 'histogram' || spec.viz === 'box') && spec.field === f.key
                      ? styles.pillOn
                      : ''
                  }`}
                  onClick={() =>
                    patch({ field: f.key, viz: spec.viz === 'box' ? 'box' : 'histogram' })
                  }
                >
                  <Ruler size={12} aria-hidden /> {fieldLabel(ds.key, f.key)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 차트 — 쓰임새별(태블로 'Show Me'처럼) */}
      <section className={styles.section}>
        <h3>{t('studio.edit.viz')}</h3>
        {STUDIO_VIZ_GROUPS.map((g) => (
          <div key={g.key} className={styles.vizGroup}>
            <span>{tDyn(`studio.vizGroup.${g.key}`, g.label)}</span>
            <div className={styles.vizRow}>
              {g.viz.map((v) => {
                const I = VIZ_ICON[v];
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.vizBtn} ${spec.viz === v ? styles.vizOn : ''}`}
                    disabled={!vizFits(ds, spec.dimension, v)}
                    title={DASH_VIZ_LABEL[v]}
                    aria-pressed={spec.viz === v}
                    onClick={() => patch({ viz: v })}
                  >
                    <I size={16} aria-hidden />
                    <small>{DASH_VIZ_LABEL[v]}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* 구성 */}
      <section className={styles.section}>
        <h3>{t('studio.edit.shelf')}</h3>
        <label className={styles.field}>
          <span>{t('studio.edit.measure')}</span>
          <Select
            value={spec.measure}
            onValueChange={(v) => patch({ measure: v })}
            options={ds.measures.map((m) => ({ value: m.key, label: measureLabel(ds.key, m.key) }))}
          />
        </label>
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
        <label className={styles.field}>
          <span>{t('studio.edit.dimension')}</span>
          <Select
            value={spec.dimension ?? '__none'}
            onValueChange={(v) => {
              const dim = v === '__none' ? null : v;
              patch({ dimension: dim, viz: fitViz(ds, dim, spec.viz) });
            }}
            options={[
              { value: '__none', label: t('studio.edit.none') },
              ...ds.dimensions.map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) })),
            ]}
          />
        </label>
        {dimIsTime && (
          <label className={styles.field}>
            <span>{t('studio.edit.grain')}</span>
            <Select
              value={spec.grain ?? 'month'}
              onValueChange={(v) => patch({ grain: v as StudioSpec['grain'] })}
              options={STUDIO_GRAINS.map((g) => ({ value: g, label: grainLabel(g) }))}
            />
          </label>
        )}
        {(spec.viz === 'stacked' || spec.viz === 'heatmap' || spec.split) && (
          <label className={styles.field}>
            <span>{t('studio.edit.split')}</span>
            <Select
              value={spec.split ?? '__none'}
              onValueChange={(v) => patch({ split: v === '__none' ? null : v })}
              options={[
                { value: '__none', label: t('studio.edit.splitNone') },
                ...ds.dimensions
                  .filter((d) => d.key !== spec.dimension && d.kind !== 'time')
                  .map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) })),
              ]}
            />
          </label>
        )}
        <label className={styles.field}>
          <span>{t('studio.edit.period')}</span>
          <Select
            value={spec.period}
            onValueChange={(v) => patch({ period: v as StudioSpec['period'] })}
            options={DASH_PERIODS.map((p) => ({ value: p, label: DASH_PERIOD_LABEL[p] }))}
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
      </section>

      {/* 보는 사람이 누르는 요소 */}
      <section className={styles.section}>
        <h3>{t('studio.edit.controls')}</h3>
        {!controls.length && <p className={styles.muted}>{t('studio.edit.noControls')}</p>}
        {controls.map((c, i) => (
          <div key={i} className={styles.ctl}>
            <div className={styles.ctlHead}>
              {c.kind === 'filter' ? (
                <Badge variant="subtle" color="neutral">
                  {t('studio.edit.filter')}
                </Badge>
              ) : (
                <SegmentedControl
                  size="sm"
                  value={c.kind}
                  onChange={(v) => updateCtl(i, { ...c, kind: v as SelectCtl['kind'] })}
                  options={[
                    { value: 'segment', label: t('studio.edit.segment') },
                    { value: 'dropdown', label: t('studio.edit.dropdown') },
                  ]}
                />
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
            {c.kind === 'filter' ? (
              <Select
                size="sm"
                value={c.dim}
                onValueChange={(v) => updateCtl(i, { ...c, dim: v })}
                options={ds.dimensions
                  .filter((d) => d.kind !== 'time')
                  .map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) }))}
                aria-label={t('studio.edit.filterDim')}
              />
            ) : (
              <>
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
            <label className={styles.placeRow}>
              <span>{t('studio.edit.place')}</span>
              <Select
                size="sm"
                value={c.place ?? 'left'}
                onValueChange={(v) =>
                  updateCtl(i, { ...c, place: v === 'left' ? undefined : (v as StudioPlace) })
                }
                options={STUDIO_PLACES.map((pl) => ({ value: pl, label: t(`studio.place.${pl}`) }))}
              />
            </label>
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
      </section>
    </div>
  );
}

// ═══════════ 가운데 — 미리보기(실제 대시보드 칸 크기) ═══════════
const SIZES = { s: 4, m: 6, l: 12 } as const;
function PreviewCanvas({ spec }: { spec: StudioSpec }) {
  const { t } = useTranslation();
  const [size, setSize] = useState<keyof typeof SIZES>('m');
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 대시보드 콘텐츠 폭(약 1,200px) 기준 12칸 중 몇 칸 — 넓게는 캔버스 폭을 다 쓴다
  const avail = Math.max(300, boxW - 48);
  const base = Math.min(avail, 1200);
  const w = Math.min(avail, Math.max(300, Math.round((base * SIZES[size]) / DASH_COLS)));
  const rowsH = spec.viz === 'card' || spec.viz === 'gauge' ? 2 : 4;
  const h = rowsH * DASH_ROW_HEIGHT + (rowsH - 1) * 16;
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
    <>
      <div className={styles.centerBar}>
        <b>{t('studio.preview.title')}</b>
        <span className={styles.spacer} />
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
      </div>
      <div ref={boxRef} className={styles.canvas}>
        <section className={styles.frame} style={{ width: w, height: h }}>
          <div className={styles.frameHead}>
            <span className={styles.frameTitle}>{spec.title || t('studio.newWidget')}</span>
            <span ref={setSlot} className={styles.frameSlot} />
          </div>
          <div className={styles.frameBody}>
            <StudioWidget spec={preview} load={load} headerSlot={slot} />
          </div>
        </section>
      </div>
    </>
  );
}

// ═══════════ 오른쪽 — AI와 대화(선택지를 주고, 누르면 이어서) ═══════════
interface AiReply {
  summary: string;
  proposals: StudioProposal[];
  questions: string[];
  followups: string[];
}
type Msg =
  | { role: 'user'; text: string }
  | { role: 'ai'; reply: AiReply; picked: number }
  | { role: 'error'; text: string };

function AiChat({
  spec,
  enabled,
  onApply,
  onAsk,
}: {
  spec: StudioSpec;
  enabled: boolean;
  onApply: (s: StudioSpec) => void;
  onAsk: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  /** AI에게 넘길 대화 — 사용자 말, AI 요약과 고른 안 */
  const history = (list: Msg[]): { role: 'user' | 'ai'; text: string }[] =>
    list.flatMap((m): { role: 'user' | 'ai'; text: string }[] =>
      m.role === 'user'
        ? [{ role: 'user' as const, text: m.text }]
        : m.role === 'ai'
          ? [
              {
                role: 'ai' as const,
                text: `${m.reply.summary}${
                  m.picked >= 0 ? ` (고른 안: ${m.reply.proposals[m.picked]?.name ?? ''})` : ''
                }`,
              },
            ]
          : [],
    );

  const send = async (raw: string) => {
    // 글자 수 표시가 보내기 버튼과 겹쳐서 maxLength 대신 보낼 때 자른다(서버도 2000자)
    const ask = raw.trim().slice(0, 2000);
    if (!ask || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', text: ask }];
    setMsgs(next);
    setText('');
    setBusy(true);
    onAsk(ask);
    try {
      const reply = await api<AiReply>('/custom-widgets/propose', {
        method: 'POST',
        body: JSON.stringify({
          prompt: ask,
          // 앞에서 고른 안(지금 미리보기)이 있으면 그것을 고쳐 달라는 뜻
          ...(msgs.some((m) => m.role === 'ai') ? { current: spec } : {}),
          history: history(msgs),
        }),
      });
      setMsgs([...next, { role: 'ai', reply, picked: 0 }]);
      // 추천안을 바로 미리보기로
      onApply(reply.proposals[0].spec);
    } catch (e) {
      setMsgs([
        ...next,
        { role: 'error', text: e instanceof ApiError ? e.message : t('studio.ai.failed') },
      ]);
    } finally {
      setBusy(false);
    }
  };
  const pick = (mi: number, pi: number) => {
    const m = msgs[mi];
    if (m?.role !== 'ai') return;
    setMsgs((list) => list.map((x, k) => (k === mi && x.role === 'ai' ? { ...x, picked: pi } : x)));
    onApply(m.reply.proposals[pi].spec);
  };

  const examples = [t('studio.ai.ex1'), t('studio.ai.ex2'), t('studio.ai.ex3')];
  return (
    <div className={styles.chat}>
      <div className={styles.chatHead}>
        <b>{t('studio.ai.title')}</b>
      </div>
      <div ref={listRef} className={styles.chatList}>
        {!enabled ? (
          <p className={styles.muted}>{t('studio.ai.noPerm')}</p>
        ) : !msgs.length ? (
          <div className={styles.chatEmpty}>
            <p>{t('studio.ai.hello')}</p>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                className={styles.suggest}
                onClick={() => void send(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        ) : (
          msgs.map((m, mi) =>
            m.role === 'user' ? (
              <div key={mi} className={styles.userMsg}>
                {m.text}
              </div>
            ) : m.role === 'error' ? (
              <div key={mi} className={styles.errMsg}>
                {m.text}
              </div>
            ) : (
              <div key={mi} className={styles.aiMsg}>
                {m.reply.summary && <p>{m.reply.summary}</p>}
                <div className={styles.proposals}>
                  {m.reply.proposals.map((p, pi) => {
                    const I = VIZ_ICON[p.spec.viz];
                    return (
                      <button
                        key={pi}
                        type="button"
                        className={`${styles.proposal} ${m.picked === pi ? styles.picked : ''}`}
                        onClick={() => pick(mi, pi)}
                      >
                        <span className={styles.proposalHead}>
                          <I size={14} aria-hidden />
                          <b>{p.name}</b>
                          {pi === 0 && (
                            <Badge variant="subtle" color="primary">
                              {t('studio.ai.recommended')}
                            </Badge>
                          )}
                        </span>
                        <span className={styles.proposalWhy}>{p.why}</span>
                      </button>
                    );
                  })}
                </div>
                {m.reply.questions.length > 0 && (
                  <ul className={styles.questions}>
                    {m.reply.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                )}
                {mi === msgs.length - 1 && m.reply.followups.length > 0 && (
                  <div className={styles.followups}>
                    {m.reply.followups.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={styles.suggest}
                        onClick={() => void send(f)}
                        disabled={busy}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )
        )}
        {busy && (
          <div className={styles.aiMsg}>
            <Skeleton height={12} width="60%" />
            <span className={styles.muted}>{t('studio.ai.asking')}</span>
          </div>
        )}
      </div>
      {enabled && (
        <div className={styles.composer}>
          <div className={styles.inputBox}>
            <textarea
              value={text}
              rows={3}
              placeholder={t('studio.ai.ph')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(text);
                }
              }}
            />
            <div className={styles.inputBar}>
              <button
                type="button"
                className={styles.sendBtn}
                onClick={() => void send(text)}
                disabled={busy || !text.trim()}
                aria-label={t('studio.ai.send')}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
