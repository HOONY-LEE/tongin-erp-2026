import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Input, Select } from '@sunghoon_lee/akron-ui';
import {
  AlignLeft,
  ChevronDown,
  ArrowLeft,
  BarChart3,
  GripVertical,
  LayoutTemplate,
  SlidersHorizontal,
  Type,
  ArrowUp,
  FileText,
  Paperclip,
  CalendarDays,
  Globe,
  Hash,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  DASH_COLORS,
  DASH_COLS,
  DASH_PERIODS,
  DASH_ROW_HEIGHT,
  STUDIO_DATASETS,
  STUDIO_DATASET_GROUPS,
  STUDIO_DATASET_MAP,
  STUDIO_GRAINS,
  STUDIO_SIZE_LIMIT,
  STUDIO_SUBTITLE_SIZES,
  STUDIO_TITLE_SIZES,
  STUDIO_COLS,
  STUDIO_VIZ,
  STUDIO_VIZ_GROUPS,
  normalizeStudioSpec,
  studioDefaultSize,
  studioLayout,
  studioRemoveControl,
  type StudioAlign,
  type StudioBox,
  type StudioLook,
  type CustomWidgetRow,
  type StudioControl,
  type StudioDataset,
  type StudioDimKind,
  type StudioParams,
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
  dsGroupLabel,
  dsLabel,
  fieldLabel,
  grainLabel,
  measureLabel,
  optLabel,
} from '../components/dashboard/studio/studioLabels';
import { DASH_PERIOD_LABEL, DASH_VIZ_LABEL } from '../i18n/codes';
import { useTheme } from '../theme/ThemeProvider';
import { colorLabel } from '../i18n/dashWidgets';
import { tDyn } from '../i18n';
import styles from './WidgetStudio.module.css';
import builder from '../components/dashboard/builder/builder.module.css';

/** 만든 위젯 목록은 대시보드 관리의 '위젯' 탭 */
const LIST_TAB = '/dashboard-admin?tab=widgets';
const LIST = '/dashboard-admin/widgets';

/** 항목 종류 표시(태블로처럼) — 글자 Abc · 날짜 달력 · 위치 지구본 · 숫자 # */
function TypeIcon({ kind }: { kind: StudioDimKind | 'number' }) {
  if (kind === 'time') return <CalendarDays size={13} aria-hidden className={styles.typeIcon} />;
  if (kind === 'geo') return <Globe size={13} aria-hidden className={styles.typeIcon} />;
  if (kind === 'number') return <Hash size={13} aria-hidden className={styles.typeIcon} />;
  return (
    <span className={`${styles.typeIcon} ${styles.abc}`} aria-hidden>
      Abc
    </span>
  );
}

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
const NO_DIM_VIZ: StudioViz[] = ['card', 'gauge', 'histogram', 'typo'];

/** 지금 고른 기준으로 그릴 수 있는 차트인가 — 기준이 없으면 숫자 카드류만, 있으면 그 반대 */
const vizFits = (ds: StudioDataset, dimension: string | null | undefined, v: StudioViz) => {
  if (!vizOk(ds, v)) return false;
  const dim = dimension ? ds.dimensions.find((d) => d.key === dimension) : undefined;
  if (!dim) return NO_DIM_VIZ.includes(v);
  // 타이포그래피는 기준이 있어도(위 몇 개를 큰 글자로) — 날짜 기준만 빼고
  if (v === 'typo') return dim.kind !== 'time';
  if (NO_DIM_VIZ.includes(v)) return false;
  if (v === 'calendar') return dim.kind === 'time';
  if (v === 'gantt') return dim.kind !== 'time';
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
  // 고른 요소(트리·미리보기 공통)와 왼쪽 판 탭
  const [sel, setSelRaw] = useState<string | null>(null);
  const [paneTab, setPaneTab] = useState<PaneTab>('data');
  const setSel = useCallback((id: string | null) => {
    setSelRaw(id);
    // 차트·보기 옵션·부제를 고르면 그걸 고치는 '차트 모양' 탭으로
    if (id && id !== 'widget') setPaneTab('chart');
  }, []);
  const [rightW, setRightW] = usePaneWidth('right', 360);
  // 미리보기 데이터의 항목(항목별 색 고르기)
  const [items, setItems] = useState<{ key: string; label: string }[]>([]);
  const onData = useCallback((r: StudioResult) => setItems(colorItems(r)), []);

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
            <SettingsPane
              spec={spec}
              patch={patch}
              sel={sel}
              onSel={setSel}
              tab={paneTab}
              setTab={setPaneTab}
              items={items}
            />
            <PaneResizer side="left" width={leftW} onChange={setLeftW} />
          </aside>
          <main className={styles.center}>
            <PreviewCanvas
              spec={spec}
              patch={patch}
              sel={sel}
              onSel={setSel}
              onData={onData}
              onRemove={(id) => {
                const p = removeElement(spec, id);
                if (p) {
                  patch(p);
                  setSel(null);
                }
              }}
            />
          </main>
          <aside className={styles.right}>
            <PaneResizer side="right" width={rightW} onChange={setRightW} />
            <AiChat
              spec={spec}
              enabled={can('DASHBOARD.CREATE')}
              onApply={(next) =>
                // AI 안은 데이터·차트만 바꾼다 — 내가 잡은 배치·글자·크기는 그대로
                setSpec({ ...next, layout: spec.layout, look: spec.look, size: spec.size })
              }
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
type PaneTab = 'data' | 'chart';
type DragItem = { kind: 'measure' | 'dimension' | 'field'; key: string };
const DRAG_MIME = 'application/x-tongin-field';

function SettingsPane({
  spec,
  patch,
  sel,
  onSel,
  tab,
  setTab,
  items,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
  sel: string | null;
  onSel: (id: string | null) => void;
  tab: PaneTab;
  setTab: (t: PaneTab) => void;
  items: { key: string; label: string }[];
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.leftWrap}>
      <div className={styles.leftTabs}>
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={(v) => setTab(v as PaneTab)}
          options={[
            { value: 'data', label: t('studio.pane.data') },
            { value: 'chart', label: t('studio.pane.chart') },
          ]}
        />
      </div>
      <div className={styles.paneScroll}>
        {tab === 'data' ? (
          <DataTab spec={spec} patch={patch} />
        ) : (
          <ChartTab spec={spec} patch={patch} sel={sel} onSel={onSel} items={items} />
        )}
      </div>
      {tab === 'chart' && <ElementTree spec={spec} patch={patch} sel={sel} onSel={onSel} />}
    </div>
  );
}

// ── 데이터 탭 — 태블로처럼 왼쪽에 항목을 세로로, 위에 열·행 칸(끌어 놓거나 누르기) ──
/** 열·행 칸에 넣고 빼기 — 데이터 판(누르기)과 미리보기 머리글의 칸(끌어 놓기)이 같이 쓴다 */
function useShelfOps(spec: StudioSpec, patch: (p: Partial<StudioSpec>) => void) {
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  const distViz = spec.viz === 'histogram' || spec.viz === 'box';
  const setDim = (dim: string | null) =>
    patch({
      dimension: dim,
      split: dim ? spec.split : null,
      viz: distViz && dim ? 'box' : fitViz(ds, dim, spec.viz),
    });
  const setField = (key: string | undefined) =>
    patch(
      key
        ? { field: key, viz: spec.dimension ? 'box' : 'histogram' }
        : { field: undefined, viz: fitViz(ds, spec.dimension ?? null, distViz ? 'bar' : spec.viz) },
    );
  /** 누르거나 끌어 놓았을 때 — 숫자는 행, 기준은 열(이미 있으면 두 번째 기준), 건별 숫자는 분포 */
  const assign = (it: DragItem, shelf?: 'cols' | 'rows' | 'split' | 'rows2') => {
    if (it.kind === 'dimension') {
      if (shelf === 'split') {
        if (it.key !== spec.dimension) patch({ split: it.key });
        return;
      }
      if (shelf === 'rows' || shelf === 'rows2') return;
      setDim(!shelf && spec.dimension === it.key ? null : it.key);
      return;
    }
    if (it.kind === 'field') {
      if (shelf === 'cols' || shelf === 'split') return;
      setField(it.key);
      return;
    }
    if (shelf === 'cols' || shelf === 'split') return;
    if (shelf === 'rows2') {
      if (it.key !== spec.measure) patch({ measure2: it.key, viz: 'scatter' });
      return;
    }
    patch({
      measure: it.key,
      ...(distViz ? { field: undefined, viz: fitViz(ds, spec.dimension ?? null, 'bar') } : {}),
    });
  };
  return { setDim, setField, assign };
}

/** 미리보기 머리글의 열·행 칸 + 시간 단위·기간 — 왼쪽 항목을 끌어 놓는다 */
function ShelfBar({ spec, patch }: { spec: StudioSpec; patch: (p: Partial<StudioSpec>) => void }) {
  const { t } = useTranslation();
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  const dimIsTime = ds.dimensions.find((d) => d.key === spec.dimension)?.kind === 'time';
  const distViz = spec.viz === 'histogram' || spec.viz === 'box';
  const [over, setOver] = useState<string | null>(null);
  const { setDim, setField, assign } = useShelfOps(spec, patch);
  const readDrag = (e: React.DragEvent): DragItem | null => {
    try {
      return JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as DragItem;
    } catch {
      return null;
    }
  };
  const dropZone = (id: 'cols' | 'rows' | 'split' | 'rows2') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.stopPropagation(); // 안쪽 칸(두 번째 기준·숫자)에 놓으면 바깥 칸은 받지 않는다
      setOver(id);
    },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      const it = readDrag(e);
      if (it) assign(it, id);
    },
  });
  const chip = (cls: string, icon: ReactNode, label: string, onRemove?: () => void) => (
    <span className={`${styles.shelfChip} ${cls}`}>
      {icon}
      <span className={styles.shelfChipText}>{label}</span>
      {onRemove && (
        <button type="button" aria-label={t('studio.edit.remove')} onClick={onRemove}>
          <X size={12} />
        </button>
      )}
    </span>
  );
  const dim = ds.dimensions.find((d) => d.key === spec.dimension);
  return (
    <div className={styles.shelfBar}>
      {/* 열·행 칸 */}
      <div className={styles.shelves}>
        <div className={styles.shelfRow}>
          <span className={styles.shelfName}>{t('studio.pane.cols')}</span>
          <div
            className={`${styles.shelf} ${over === 'cols' ? styles.shelfOver : ''}`}
            {...dropZone('cols')}
          >
            {spec.dimension ? (
              chip(
                styles.dimension,
                <TypeIcon kind={dim?.kind ?? 'cat'} />,
                dimLabel(ds.key, spec.dimension),
                () => setDim(null),
              )
            ) : (
              <span className={styles.shelfEmpty}>{t('studio.pane.dropDim')}</span>
            )}
            {spec.dimension &&
              (spec.split ? (
                chip(
                  styles.dimension,
                  <TypeIcon
                    kind={ds.dimensions.find((d) => d.key === spec.split)?.kind ?? 'cat'}
                  />,
                  dimLabel(ds.key, spec.split),
                  () => patch({ split: null }),
                )
              ) : (
                <span
                  className={`${styles.shelfSlot} ${over === 'split' ? styles.shelfOver : ''}`}
                  {...dropZone('split')}
                >
                  {t('studio.pane.dropSplit')}
                </span>
              ))}
          </div>
        </div>
        <div className={styles.shelfRow}>
          <span className={styles.shelfName}>{t('studio.pane.rows')}</span>
          <div
            className={`${styles.shelf} ${over === 'rows' ? styles.shelfOver : ''}`}
            {...dropZone('rows')}
          >
            {distViz && spec.field
              ? chip(
                  styles.fieldPill,
                  <TypeIcon kind="number" />,
                  fieldLabel(ds.key, spec.field),
                  () => setField(undefined),
                )
              : chip(
                  styles.measure,
                  <TypeIcon kind="number" />,
                  measureLabel(ds.key, spec.measure),
                )}
            {!distViz &&
              (spec.viz === 'scatter' && spec.measure2 ? (
                chip(
                  styles.measure,
                  <TypeIcon kind="number" />,
                  measureLabel(ds.key, spec.measure2),
                  () =>
                    patch({
                      measure2: undefined,
                      viz: fitViz(ds, spec.dimension ?? null, 'bar'),
                    }),
                )
              ) : ds.measures.length > 1 && spec.dimension ? (
                <span
                  className={`${styles.shelfSlot} ${over === 'rows2' ? styles.shelfOver : ''}`}
                  {...dropZone('rows2')}
                >
                  {t('studio.pane.dropMeasure2')}
                </span>
              ) : null)}
          </div>
        </div>
      </div>
      <div className={styles.shelfOpts}>
        {dimIsTime && (
          <label className={styles.field}>
            <span>{t('studio.edit.grain')}</span>
            <Select
              size="sm"
              value={spec.grain ?? 'month'}
              onValueChange={(v) => patch({ grain: v as StudioSpec['grain'] })}
              options={STUDIO_GRAINS.map((g) => ({ value: g, label: grainLabel(g) }))}
            />
          </label>
        )}
        <label className={styles.field}>
          <span>{t('studio.edit.period')}</span>
          <Select
            size="sm"
            value={spec.period}
            onValueChange={(v) => patch({ period: v as StudioSpec['period'] })}
            options={DASH_PERIODS.map((p) => ({ value: p, label: DASH_PERIOD_LABEL[p] }))}
          />
        </label>
      </div>
    </div>
  );
}

function DataTab({ spec, patch }: { spec: StudioSpec; patch: (p: Partial<StudioSpec>) => void }) {
  const { t } = useTranslation();
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  const distViz = spec.viz === 'histogram' || spec.viz === 'box';
  const { assign } = useShelfOps(spec, patch);
  const { can } = useAuth();
  // 데이터 고르기 — 묶음(영업·운영·인사…)별로, 볼 권한이 있는 데이터만(지금 고른 것은 늘 보인다)
  const datasetOptions = STUDIO_DATASET_GROUPS.map((g) => ({
    label: dsGroupLabel(g.key),
    options: STUDIO_DATASETS.filter(
      (d) =>
        d.group === g.key &&
        (d.key === spec.dataset || (Array.isArray(d.perm) ? d.perm : [d.perm]).some(can)),
    ).map((d) => ({ value: d.key, label: dsLabel(d.key) })),
  })).filter((g) => g.options.length);
  const dragProps = (it: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(it));
      e.dataTransfer.effectAllowed = 'copy';
    },
  });

  return (
    <>
      <section className={styles.section}>
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
          options={datasetOptions}
          aria-label={t('studio.edit.dataset')}
        />
      </section>

      {/* 항목 목록 — 세로로(태블로 데이터 판) */}
      <section className={`${styles.section} ${styles.fieldList}`}>
        <span className={`${styles.catHead} ${styles.catDim}`}>
          {t('studio.catalog.dimensions')}
        </span>
        {ds.dimensions.map((d) => {
          const on = spec.dimension === d.key || spec.split === d.key;
          return (
            <button
              key={d.key}
              type="button"
              className={`${styles.fieldRow} ${styles.dimension} ${on ? styles.fieldOn : ''}`}
              onClick={() => assign({ kind: 'dimension', key: d.key })}
              {...dragProps({ kind: 'dimension', key: d.key })}
            >
              <GripVertical size={12} className={styles.grip} aria-hidden />
              <TypeIcon kind={d.kind} />
              <span>{dimLabel(ds.key, d.key)}</span>
            </button>
          );
        })}
        <span className={`${styles.catHead} ${styles.catMeasure}`}>
          {t('studio.catalog.measures')}
        </span>
        {ds.measures.map((m) => {
          const on = spec.measure === m.key || spec.measure2 === m.key;
          return (
            <button
              key={m.key}
              type="button"
              className={`${styles.fieldRow} ${styles.measure} ${on ? styles.fieldOn : ''}`}
              title={m.description}
              onClick={() => assign({ kind: 'measure', key: m.key })}
              {...dragProps({ kind: 'measure', key: m.key })}
            >
              <GripVertical size={12} className={styles.grip} aria-hidden />
              <TypeIcon kind="number" />
              <span>{measureLabel(ds.key, m.key)}</span>
            </button>
          );
        })}
        {ds.fields.map((f) => {
          const on = distViz && spec.field === f.key;
          return (
            <button
              key={f.key}
              type="button"
              className={`${styles.fieldRow} ${styles.measure} ${styles.rawField} ${on ? styles.fieldOn : ''}`}
              title={t('studio.catalog.rawHint')}
              onClick={() => assign({ kind: 'field', key: f.key })}
              {...dragProps({ kind: 'field', key: f.key })}
            >
              <GripVertical size={12} className={styles.grip} aria-hidden />
              <TypeIcon kind="number" />
              <span>{fieldLabel(ds.key, f.key)}</span>
            </button>
          );
        })}
      </section>
    </>
  );
}

// ── 차트 모양 탭 — 차트 · 제목/부제 · 보기 옵션 ──
function ChartTab({
  spec,
  patch,
  sel,
  onSel,
  items,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
  sel: string | null;
  onSel: (id: string | null) => void;
  items: { key: string; label: string }[];
}) {
  const { t } = useTranslation();
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  const timeDims = ds.dimensions.filter((d) => d.kind === 'time');
  const dimIsTime = ds.dimensions.find((d) => d.key === spec.dimension)?.kind === 'time';
  const controls = spec.controls ?? [];
  const setControls = (c: StudioControl[]) => patch({ controls: c });
  const has = (target: string) =>
    controls.some((c) => c.kind !== 'filter' && (c as SelectCtl).target === target);
  // 트리에서 고른 보기 옵션을 보이게
  useEffect(() => {
    if (sel?.startsWith('ctl:'))
      document.querySelector(`[data-ctl="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

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
    <>
      <LayoutSection spec={spec} patch={patch} sel={sel} />
      {/* 차트 — 쓰임새별(태블로 'Show Me'처럼) */}
      <section className={`${styles.section} ${sel === 'chart' ? styles.sectionSel : ''}`}>
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
        {spec.viz === 'gantt' && (
          <>
            <div className={styles.layoutRow}>
              <span>{t('studio.edit.ganttStart')}</span>
              <Select
                size="sm"
                value={spec.periodField ?? ds.defaultTime}
                onValueChange={(v) => patch({ periodField: v })}
                options={timeDims.map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) }))}
                aria-label={t('studio.edit.ganttStart')}
              />
            </div>
            <div className={styles.layoutRow}>
              <span>{t('studio.edit.ganttEnd')}</span>
              <Select
                size="sm"
                value={spec.endField ?? spec.periodField ?? ds.defaultTime}
                onValueChange={(v) => patch({ endField: v })}
                options={timeDims.map((d) => ({ value: d.key, label: dimLabel(ds.key, d.key) }))}
                aria-label={t('studio.edit.ganttEnd')}
              />
            </div>
          </>
        )}
      </section>

      <ColorSection spec={spec} patch={patch} items={items} />

      {/* 제목·부제 */}
      <section
        className={`${styles.section} ${sel === 'subtitle' || sel === 'title' ? styles.sectionSel : ''}`}
      >
        <h3>{t('studio.pane.text')}</h3>
        <label className={styles.field}>
          <span>{t('studio.edit.name')}</span>
          <Input
            value={spec.title ?? ''}
            maxLength={60}
            onFocus={() => onSel('title')}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('studio.edit.subtitle')}</span>
          <Input
            value={spec.subtitle ?? ''}
            maxLength={120}
            onFocus={() => onSel('subtitle')}
            onChange={(e) => patch({ subtitle: e.target.value || undefined })}
          />
        </label>
      </section>

      {/* 보기 옵션 — 보는 사람이 바꾸는 탭·드롭다운·필터 */}
      <section className={styles.section}>
        <h3>{t('studio.edit.controls')}</h3>
        {!controls.length && <p className={styles.muted}>{t('studio.edit.noControls')}</p>}
        {controls.map((c, i) => (
          <div
            key={i}
            data-ctl={`ctl:${i}`}
            className={`${styles.ctl} ${sel === `ctl:${i}` ? styles.ctlSel : ''}`}
            onPointerDownCapture={() => onSel(`ctl:${i}`)}
          >
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
                onClick={() => {
                  patch(studioRemoveControl(spec, i));
                  onSel(null);
                }}
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
    </>
  );
}

// ── 색상 — 색 묶음(팔레트)과 항목마다 색 ──
/** 데이터에서 색을 줄 수 있는 항목 — 항목별 값·누적 막대의 줄·간트 줄 */
function colorItems(r: StudioResult): { key: string; label: string }[] {
  const d = r.data;
  if (d.shape === 'category' || d.shape === 'gantt')
    return d.items.slice(0, 20).map((i) => ({ key: i.key, label: i.label }));
  if (d.shape === 'matrix') return d.rows.slice(0, 20).map((x) => ({ key: x, label: x }));
  return [];
}
function ColorSection({
  spec,
  patch,
  items,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
  items: { key: string; label: string }[];
}) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const look = spec.look ?? {};
  const colors = look.colors ?? {};
  const setLook = (l: Partial<StudioLook>) => patch({ look: { ...look, ...l } });
  const setColor = (k: string, v: string | null) => {
    const next = { ...colors };
    if (v) next[k] = v;
    else delete next[k];
    setLook({ colors: Object.keys(next).length ? next : undefined });
  };
  const dark = resolved === 'dark';
  return (
    <section className={styles.section}>
      <h3>{t('studio.color.title')}</h3>
      <div className={styles.palette} role="radiogroup" aria-label={t('studio.color.palette')}>
        <button
          type="button"
          role="radio"
          aria-checked={!look.palette}
          className={`${styles.swatch} ${styles.swatchAuto} ${!look.palette ? styles.swatchOn : ''}`}
          title={t('studio.color.dashDefault')}
          onClick={() => setLook({ palette: undefined })}
        >
          A
        </button>
        {DASH_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={look.palette === c.key}
            className={`${styles.swatch} ${look.palette === c.key ? styles.swatchOn : ''}`}
            style={{ background: dark ? c.dark : c.light }}
            title={colorLabel(c)}
            aria-label={colorLabel(c)}
            onClick={() => setLook({ palette: c.key })}
          />
        ))}
      </div>
      {items.length > 0 && (
        <div className={styles.colorList}>
          {items.map((it) => (
            <div key={it.key} className={styles.colorRow}>
              <label className={styles.colorPick} title={t('studio.color.pick')}>
                <input
                  type="color"
                  value={colors[it.key] ?? '#999999'}
                  onChange={(e) => setColor(it.key, e.target.value)}
                  aria-label={`${it.label} ${t('studio.color.pick')}`}
                />
                <span
                  className={colors[it.key] ? undefined : styles.colorAuto}
                  style={colors[it.key] ? { background: colors[it.key] } : undefined}
                />
              </label>
              <span className={styles.colorLabel}>{it.label}</span>
              {colors[it.key] ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('studio.color.reset')}
                  title={t('studio.color.reset')}
                  onClick={() => setColor(it.key, null)}
                >
                  <X size={12} />
                </button>
              ) : (
                <small className={styles.muted}>{t('studio.color.auto')}</small>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── 배치 — 고른 요소의 칸 수·정렬·글자, 위젯 기본 크기 ──
function LayoutSection({
  spec,
  patch,
  sel,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
  sel: string | null;
}) {
  const { t } = useTranslation();
  const layout = studioLayout(spec);
  const box = sel ? layout[sel] : undefined;
  const look = spec.look ?? {};
  const size = studioDefaultSize(spec);
  const L = STUDIO_SIZE_LIMIT;
  const setBox = (b: Partial<StudioBox>) => {
    if (!sel || !box) return;
    const next = { ...box, ...b };
    // 칸 수를 늘려 옆 요소와 겹치면 늘린 만큼만
    const others = Object.entries(layout)
      .filter(([k, o]) => k !== sel && o.y === next.y && o.x >= next.x)
      .map(([, o]) => o.x);
    next.w = Math.max(1, Math.min(next.w, STUDIO_COLS - next.x, ...others.map((x) => x - next.x)));
    patch({ layout: { ...layout, [sel]: next } });
  };
  const setLook = (l: Partial<StudioLook>) => patch({ look: { ...look, ...l } });
  const range = (lo: number, hi: number) =>
    Array.from({ length: hi - lo + 1 }, (_, i) => ({
      value: String(lo + i),
      label: String(lo + i),
    }));
  return (
    <section className={styles.section}>
      <h3>{t('studio.layout.title')}</h3>
      {box && (
        <>
          <div className={styles.layoutRow}>
            <span>{t('studio.layout.cols')}</span>
            <Select
              size="sm"
              value={String(box.w)}
              onValueChange={(v) => setBox({ w: Number(v) })}
              options={range(1, STUDIO_COLS - box.x)}
              aria-label={t('studio.layout.cols')}
            />
          </div>
          {sel !== 'chart' && (
            <div className={styles.layoutRow}>
              <span>{t('studio.layout.align')}</span>
              <SegmentedControl
                size="sm"
                value={box.align ?? 'start'}
                onChange={(v) => setBox({ align: v === 'start' ? undefined : (v as StudioAlign) })}
                options={[
                  { value: 'start', label: t('studio.layout.left') },
                  { value: 'center', label: t('studio.layout.center') },
                  { value: 'end', label: t('studio.layout.right') },
                ]}
              />
            </div>
          )}
          {sel === 'title' && (
            <>
              <div className={styles.layoutRow}>
                <span>{t('studio.layout.fontSize')}</span>
                <Select
                  size="sm"
                  value={String(look.titleSize ?? 14)}
                  onValueChange={(v) => setLook({ titleSize: Number(v) })}
                  options={STUDIO_TITLE_SIZES.map((n) => ({ value: String(n), label: `${n}px` }))}
                  aria-label={t('studio.layout.fontSize')}
                />
              </div>
              <div className={styles.layoutRow}>
                <span>{t('studio.layout.weight')}</span>
                <SegmentedControl
                  size="sm"
                  value={look.titleBold === false ? 'normal' : 'bold'}
                  onChange={(v) => setLook({ titleBold: v === 'bold' ? undefined : false })}
                  options={[
                    { value: 'bold', label: t('studio.layout.bold') },
                    { value: 'normal', label: t('studio.layout.normal') },
                  ]}
                />
              </div>
            </>
          )}
          {sel === 'subtitle' && (
            <div className={styles.layoutRow}>
              <span>{t('studio.layout.fontSize')}</span>
              <Select
                size="sm"
                value={String(look.subtitleSize ?? 12)}
                onValueChange={(v) => setLook({ subtitleSize: Number(v) })}
                options={STUDIO_SUBTITLE_SIZES.map((n) => ({ value: String(n), label: `${n}px` }))}
                aria-label={t('studio.layout.fontSize')}
              />
            </div>
          )}
        </>
      )}
      <div className={styles.layoutRow}>
        <span>{t('studio.layout.size')}</span>
        <span className={styles.sizePick}>
          <Select
            size="sm"
            value={String(size.w)}
            onValueChange={(v) => patch({ size: { ...size, w: Number(v) } })}
            options={range(L.minW, L.maxW)}
            aria-label={t('studio.layout.sizeW')}
          />
          ×
          <Select
            size="sm"
            value={String(size.h)}
            onValueChange={(v) => patch({ size: { ...size, h: Number(v) } })}
            options={range(L.minH, L.maxH)}
            aria-label={t('studio.layout.sizeH')}
          />
        </span>
      </div>
      {spec.layout && (
        <button type="button" className={styles.add} onClick={() => patch({ layout: undefined })}>
          {t('studio.layout.reset')}
        </button>
      )}
    </section>
  );
}

// ── 요소 트리 — 위젯 안의 요소를 고르고(미리보기에도 표시) 지운다 ──
/** 요소 지우기 — 부제는 비우고 보기 옵션은 뺀다(제목·차트는 지우지 않는다) */
const removeElement = (spec: StudioSpec, id: string): Partial<StudioSpec> | null => {
  if (id === 'subtitle') return { subtitle: undefined };
  if (id.startsWith('ctl:')) return studioRemoveControl(spec, Number(id.slice(4)));
  return null;
};

function ElementTree({
  spec,
  patch,
  sel,
  onSel,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
  sel: string | null;
  onSel: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const ds = STUDIO_DATASET_MAP.get(spec.dataset)!;
  const controls = spec.controls ?? [];
  const VizI = VIZ_ICON[spec.viz] ?? BarChart3;
  // 접었다 펼치기(기억)
  const [open, setOpenRaw] = useState(() => {
    try {
      return localStorage.getItem('tongin_studio_tree') !== '0';
    } catch {
      return true;
    }
  });
  const setOpen = (v: boolean) => {
    setOpenRaw(v);
    try {
      localStorage.setItem('tongin_studio_tree', v ? '1' : '0');
    } catch {
      /* 저장 못 해도 그대로 */
    }
  };
  const row = (id: string, depth: number, icon: ReactNode, label: string, removable: boolean) => (
    <div
      key={id}
      role="treeitem"
      aria-selected={sel === id}
      tabIndex={0}
      className={`${styles.treeRow} ${sel === id ? styles.treeOn : ''}`}
      style={{ paddingLeft: 10 + depth * 16 }}
      onClick={() => onSel(sel === id ? null : id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSel(id);
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && removable) {
          const p = removeElement(spec, id);
          if (p) {
            patch(p);
            onSel(null);
          }
        }
      }}
    >
      {icon}
      <span className={styles.treeLabel}>{label}</span>
      {removable && (
        <button
          type="button"
          className={styles.treeDel}
          aria-label={t('studio.edit.remove')}
          onClick={(e) => {
            e.stopPropagation();
            const p = removeElement(spec, id);
            if (p) {
              patch(p);
              onSel(null);
            }
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
  return (
    <div className={styles.tree} role="tree" aria-label={t('studio.pane.elements')}>
      <button
        type="button"
        className={styles.treeHead}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown
          size={14}
          className={open ? undefined : styles.treeChevronClosed}
          aria-hidden
        />
        {t('studio.pane.elements')}
      </button>
      {open && (
        <div className={styles.treeBody}>
          {row(
            'widget',
            0,
            <LayoutTemplate size={13} aria-hidden />,
            spec.title || t('studio.newWidget'),
            false,
          )}
          {row('title', 1, <Type size={13} aria-hidden />, t('studio.pane.elTitle'), false)}
          {spec.subtitle &&
            row(
              'subtitle',
              1,
              <AlignLeft size={13} aria-hidden />,
              t('studio.pane.elSubtitle'),
              true,
            )}
          {controls.length > 0 && (
            <>
              <div className={styles.treeGroup} style={{ paddingLeft: 26 }}>
                <SlidersHorizontal size={13} aria-hidden /> {t('studio.edit.controls')}
              </div>
              {controls.map((c, i) =>
                row(
                  `ctl:${i}`,
                  2,
                  <span className={styles.treeDot} />,
                  c.kind === 'filter'
                    ? `${t('studio.edit.filter')} · ${dimLabel(ds.key, c.dim)}`
                    : `${t(c.kind === 'segment' ? 'studio.edit.segment' : 'studio.edit.dropdown')} · ${t(`studio.target.${c.target}`)}`,
                  true,
                ),
              )}
            </>
          )}
          {row(
            'chart',
            1,
            <VizI size={13} aria-hidden />,
            `${t('studio.pane.elChart')} · ${DASH_VIZ_LABEL[spec.viz]}`,
            false,
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════ 가운데 — 미리보기(실제 대시보드 칸 크기) ═══════════
const ROW_GAP = 16;
function PreviewCanvas({
  spec,
  patch,
  sel,
  onSel,
  onRemove,
  onData,
}: {
  spec: StudioSpec;
  patch: (p: Partial<StudioSpec>) => void;
  sel: string | null;
  onSel: (id: string | null) => void;
  onRemove: (id: string) => void;
  onData: (r: StudioResult) => void;
}) {
  const { t } = useTranslation();
  // 고른 요소를 Delete·Backspace로 지운다(글 입력 중이면 그대로 글자 지우기)
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'Delete' || e.key === 'Backspace') onRemove(sel);
      if (e.key === 'Escape') onSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, onRemove, onSel]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 대시보드 콘텐츠 폭(약 1,200px) 기준 — 위젯 기본 크기(칸·줄)대로 그린다
  const size = studioDefaultSize(spec);
  const [drag, setDrag] = useState<{ w: number; h: number } | null>(null);
  const cur = drag ?? size;
  // 한 칸 폭 — 실제 대시보드(약 1,200px ÷ 12)를 넘지 않게, 좁은 화면에선 8칸이 캔버스를 채우는 비율로
  const avail = Math.max(300, boxW - 48);
  const colPx = Math.min(1200 / DASH_COLS, avail / Math.max(cur.w, 8));
  const w = Math.min(avail, Math.round(colPx * cur.w));
  const h = cur.h * DASH_ROW_HEIGHT + (cur.h - 1) * ROW_GAP;
  const L = STUDIO_SIZE_LIMIT;
  /** 오른쪽 아래 모서리를 끌어 크기 바꾸기 — 대시보드 칸·줄에 맞춰 붙는다 */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { ...size };
    let last = start;
    const onMove = (ev: PointerEvent) => {
      const nw = Math.round((start.w * colPx + (ev.clientX - sx)) / colPx);
      const nh = Math.round(
        (start.h * (DASH_ROW_HEIGHT + ROW_GAP) + (ev.clientY - sy)) / (DASH_ROW_HEIGHT + ROW_GAP),
      );
      last = {
        w: Math.max(L.minW, Math.min(L.maxW, nw)),
        h: Math.max(L.minH, Math.min(L.maxH, nh)),
      };
      setDrag(last);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (last.w !== start.w || last.h !== start.h) patch({ size: last });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const load = useCallback(
    (params: StudioParams) =>
      api<StudioResult>('/custom-widgets/preview', {
        method: 'POST',
        body: JSON.stringify({ spec, params }),
      }),
    [spec],
  );
  return (
    <>
      <ShelfBar spec={spec} patch={patch} />
      <div className={styles.centerBar}>
        <span className={styles.spacer} />
        <span className={styles.sizeLabel}>{t('studio.layout.sizeIs', cur)}</span>
      </div>
      <div
        ref={boxRef}
        className={styles.canvas}
        onPointerDown={(e) => {
          // 빈 곳을 누르면 선택 풀기
          if (e.target === e.currentTarget) onSel(null);
        }}
      >
        <section
          className={`${styles.frame} ${sel === 'widget' ? styles.frameSel : ''}`}
          style={{ width: w, height: h, transition: drag ? 'none' : undefined }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onSel('widget');
          }}
        >
          <div
            className={styles.frameBody}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) onSel('widget');
            }}
          >
            <StudioWidget
              spec={spec}
              load={load}
              selected={sel}
              onSelect={onSel}
              onLayout={(layout) => patch({ layout })}
              onText={(id, v) =>
                patch(id === 'title' ? { title: v } : { subtitle: v.trim() || undefined })
              }
              onData={onData}
            />
          </div>
          <span
            className={styles.frameResize}
            title={t('studio.layout.dragSize')}
            onPointerDown={startResize}
          />
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
/** 채팅에 붙인 파일 — 그림은 미리보기 주소도 */
interface Attach {
  name: string;
  mediaType: string;
  data: string;
  preview?: string;
}
const ATTACH_MAX = 4;
const ATTACH_BYTES = 5 * 1024 * 1024;
const ATTACH_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
};
const ATTACH_ACCEPT = Object.keys(ATTACH_EXT)
  .map((e) => `.${e}`)
  .join(',');
/** 파일 → 첨부(종류는 확장자로 — CSV는 브라우저마다 MIME이 달라서) */
const readAttach = (f: File): Promise<Attach | null> => {
  const mediaType = ATTACH_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!mediaType) return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      resolve({
        name: f.name,
        mediaType,
        data: url.slice(url.indexOf(',') + 1),
        preview: mediaType.startsWith('image/') ? url : undefined,
      });
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(f);
  });
};

type Msg =
  | { role: 'user'; text: string; files?: Attach[] }
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
  const [files, setFiles] = useState<Attach[]>([]);
  const [dropOver, setDropOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  /** 파일 붙이기 — 그림·PDF·CSV·TXT, 5MB·4개까지 */
  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list];
    if (!arr.length) return;
    const room = ATTACH_MAX - files.length;
    if (room <= 0 || arr.length > room) toast({ type: 'warning', title: t('studio.ai.fileMax') });
    const ok: Attach[] = [];
    for (const f of arr.slice(0, Math.max(0, room))) {
      if (f.size > ATTACH_BYTES) {
        toast({ type: 'warning', title: t('studio.ai.fileBig', { v0: f.name }) });
        continue;
      }
      const a = await readAttach(f);
      if (!a) toast({ type: 'warning', title: t('studio.ai.fileType', { v0: f.name }) });
      else ok.push(a);
    }
    if (ok.length) setFiles((cur) => [...cur, ...ok].slice(0, ATTACH_MAX));
  };
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
    const sending = files;
    // 그림만 붙이고 말이 없으면 '이 그림처럼'으로
    const ask = (raw.trim() || (sending.length ? t('studio.ai.fromImage') : '')).slice(0, 2000);
    if (!ask || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', text: ask, files: sending }];
    setMsgs(next);
    setText('');
    setFiles([]);
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
          ...(sending.length
            ? {
                attachments: sending.map((f) => ({
                  name: f.name,
                  mediaType: f.mediaType,
                  data: f.data,
                })),
              }
            : {}),
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
    <div
      className={`${styles.chat} ${dropOver ? styles.chatDrop : ''}`}
      onDragOver={(e) => {
        if (!enabled || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropOver(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
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
                {!!m.files?.length && (
                  <span className={styles.msgFiles}>
                    {m.files.map((f, fi) =>
                      f.preview ? (
                        <img key={fi} src={f.preview} alt={f.name} />
                      ) : (
                        <span key={fi} className={styles.msgFile}>
                          <FileText size={12} aria-hidden /> {f.name}
                        </span>
                      ),
                    )}
                  </span>
                )}
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
            {files.length > 0 && (
              <div className={styles.attachRow}>
                {files.map((f, i) => (
                  <span key={i} className={styles.attach} title={f.name}>
                    {f.preview ? (
                      <img src={f.preview} alt={f.name} />
                    ) : (
                      <span className={styles.attachFile}>
                        <FileText size={14} aria-hidden />
                        <span>{f.name}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={t('studio.ai.removeFile', { v0: f.name })}
                      onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={text}
              onPaste={(e) => {
                // 캡처한 그림을 바로 붙여 넣기
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  void addFiles(e.clipboardData.files);
                }
              }}
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
                className={styles.clipBtn}
                onClick={() => fileRef.current?.click()}
                disabled={busy || files.length >= ATTACH_MAX}
                aria-label={t('studio.ai.attach')}
                title={t('studio.ai.attach')}
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ATTACH_ACCEPT}
                hidden
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.sendBtn}
                onClick={() => void send(text)}
                disabled={busy || (!text.trim() && !files.length)}
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
