import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { Select } from '@sunghoon_lee/akron-ui';
import type { MouseEvent, ReactNode } from 'react';
import { Table, useTable, type ReactColumnDef } from 'softium-ui/table';
import type { Column, Row } from './types';
import { ExportMenu, nodeText, type MaskableColumn } from './tableExport';
import { guessMaskKind, maskValue, type MaskKind } from '../../lib/mask';

const colKey = (c: Column, i: number) => c.dataIndex ?? `__col_${i}`;
const titleOf = (c: Column) => (typeof c.title === 'string' ? c.title : nodeText(c.title));
/** 이 칸을 가릴 수 있으면 종류(전화·주소·이름) — 지정값 > 제목으로 짐작 */
const maskKindOf = (c: Column): MaskKind | null =>
  c.mask === false ? null : (c.mask ?? guessMaskKind(titleOf(c)));
/** 화면에 그린 글자(가릴 때 씀) */
const cellText = (c: Column, data: Row) =>
  c.render ? nodeText(c.render(data)) : String(data[c.dataIndex ?? ''] ?? '');

/** 원본 값 그대로 그리는 칸 — 시각(ISO)은 2026-11-20 16:14로(앱 공통 표기) */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const cellValue = (v: unknown) =>
  typeof v === 'string' && ISO_TIME.test(v) ? fmtDateTime(v) : String(v ?? '');

interface Props {
  columns: Column[];
  rows: Row[];
  loading?: boolean;
  rowKey?: string;
  /** 지정 시 로우 클릭으로 상세 이동 등 처리 (로우 안의 버튼/링크 클릭은 무시하고 그 자체 동작만 수행) */
  onRowClick?: (row: Row) => void;
  /** 셋째 줄 오른쪽 끝 — 생성하기류 버튼(예: "+ 등록"). 내보내기 버튼 뒤에 온다 */
  toolbarActions?: ReactNode;
  /** 둘째 줄 가운데 — 검색창 바로 오른쪽에 붙는 필터(예: 날짜·종류 Select) */
  filters?: ReactNode;
  /** CSV/Excel/JSON/XML 내보내기 메뉴 노출 여부. 기본 false. */
  exportable?: boolean;
  /** 내보내기 파일명(확장자 제외). 기본 'table'. */
  exportFileName?: string;
  /** 내보내기 버튼을 아이콘만(축약형)으로 — 좁은 카드 안 목록 */
  exportCompact?: boolean;
  /** 한 페이지 행 수. 0을 주면 페이지 없이 전체를 그린다(상세 화면의 짧은 목록 등). */
  pageSize?: number;
  /**
   * 화면 높이에 맞춘다(ListPage fit과 함께) — 기본 행 수(10)면 페이지 스크롤 없이 풋터까지 보이고,
   * 행 수를 늘려 넘치면 표 본문만 스크롤된다(머리글·풋터는 그대로).
   */
  /** 검색·도구 줄 없이 표만(카드 안 작은 목록) */
  bare?: boolean;
  fit?: boolean;
  /** 세그먼트 탭(상태·범위) — 셋째 줄 왼쪽. 오른쪽 끝에는 내보내기·toolbarActions(생성 버튼) */
  tabs?: ReactNode;
  /** 보기 바꾸기(목록/칸반/카드 등) — 둘째 줄 오른쪽 끝(검색 · 필터 ……… 보기) */
  viewSwitch?: ReactNode;
  /**
   * 서버 검색 — 주면 검색칸 글자를 이 함수로 넘기고 표 안에서는 다시 거르지 않는다
   * (서버가 이미 거른 행을 보낸다. 받아 온 행만 검색하는 기본 동작 대신)
   */
  onSearch?: (query: string) => void;
}

/** 서버 검색일 때 표 검색 범위로 쓰는 가짜 칸 — 모든 행에 지금 검색어를 넣어 늘 맞게 한다 */
const SRV_KEY = '__srvq';

/** 처음 불러오는 동안 표 안에 깔아 둘 자리표시 행 수 */
const SKELETON_ROWS = 8;

/**
 * 칸 폭 자동 — 폭을 정하지 않은 칸은 머리글과 앞쪽 행들의 글자 길이를 재서 정한다
 * (한국AI통신 콘솔처럼 짧은 칸은 좁게, 긴 칸은 넓게). 글자는 실제 표 서체로 잰다.
 */
const SAMPLE_ROWS = 60;
const CELL_PAD = 32; // 칸 좌우 안쪽 여백 16px씩
const AUTO_MIN = 64;
const AUTO_MAX = 320;
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, px: number, weight: number, spacing = 0, mono = false) {
  if (!text) return 0;
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * px * 0.6;
  const family = getComputedStyle(document.body).fontFamily;
  measureCtx.font = `${weight} ${px}px ${mono ? "'Geist Mono', " : ''}${family}`;
  return measureCtx.measureText(text).width + spacing * text.length;
}
/** 셀을 그려 글자와 덧붙는 것(상태 점·복사 버튼)을 본다 */
function cellMeasure(c: Column, r: Row) {
  const v = c.exportValue ? c.exportValue(r) : null;
  if (!c.render) return { text: String(r[c.dataIndex ?? ''] ?? ''), extra: 0, mono: false };
  let html = '';
  try {
    // 화면 이동을 쓰는 셀(직원 칩 등)도 그릴 수 있게 라우터 안에서
    html = renderToStaticMarkup(<MemoryRouter>{c.render(r)}</MemoryRouter>);
  } catch {
    /* 그릴 수 없는 칸은 글자만 */
  }
  const text =
    v !== null && v !== undefined && v !== ''
      ? String(v)
      : html
        ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim()
        : cellText(c, r);
  // 상태 칩(좌우 여백 18px) · 복사 아이콘(15px + 4px) · 직원 칩(동그라미·여백 40px)
  const copy = html.includes('data-copy');
  const extra =
    (html.includes('sft-chip') ? 20 : 0) + (copy ? 20 : 0) + (html.includes('emp-chip') ? 40 : 0);
  return { text, extra, mono: copy };
}
/** 숫자로만 된 값(전화번호·금액·날짜·시간 등) — 이런 칸만 숫자 서체(Geist Mono) */
const NUMERIC_ONLY = /^[\d\s\-:.,%/+()~]+$/;
const EMPTY_MARK = /^[-—–\s]*$/;
/** 칸 재기 — 폭(머리글·앞쪽 행 글자 길이)과 숫자만 있는 칸인지 */
function measureColumn(c: Column, rows: Row[]) {
  const scale =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale')) || 1;
  const cells = rows
    .slice(0, SAMPLE_ROWS)
    .filter((r) => !r.__sk)
    .map((r) => cellMeasure(c, r));
  const filled = cells.filter((x) => !EMPTY_MARK.test(x.text));
  const numeric =
    filled.length > 0 && filled.every((x) => NUMERIC_ONLY.test(x.text) && /\d/.test(x.text));
  // 머리글 12px 굵게(자간 0.6px) + 정렬 화살표 자리
  let w = textWidth(titleOf(c), 12 * scale, 600, 0.6) + (c.dataIndex ? 12 : 0);
  for (const x of cells)
    w = Math.max(w, textWidth(x.text, 14 * scale, 400, 0, numeric || x.mono) + x.extra + 4);
  return { width: Math.min(AUTO_MAX, Math.max(AUTO_MIN, Math.ceil(w + CELL_PAD))), numeric };
}

/** 목록 화면 기본 페이지 크기. 푸터의 선택지(10/20/50/100) 중 하나여야 셀렉트와 값이 맞는다. */
const DEFAULT_PAGE_SIZE = 20;
/** 화면 높이 맞춤(fit) 목록의 기본 — 900px 높이 화면에서 머리글·툴바·풋터와 함께 스크롤 없이 들어간다 */
const FIT_PAGE_SIZE = 10;
/** 컬럼 정의로 렌더하는 공통 테이블 — softium-ui Table(정렬·검색·컬럼설정 내장) 기반. */
/** 풋터 'N개씩 보기' 선택지(softium 기본과 같게) */
const PAGE_SIZES = [10, 20, 50, 100];

export function DataTable({
  columns,
  rows,
  loading,
  rowKey = 'id',
  onRowClick,
  toolbarActions,
  bare = false,
  filters,
  exportable,
  exportFileName,
  exportCompact,
  pageSize,
  fit,
  tabs,
  viewSwitch,
  onSearch,
}: Props) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // 한 쪽뿐이라도 페이지 표시를 늘 보인다 — softium은 1쪽이면 가운데를 비워 둔다(그 자리에 같은 모양으로 그림)
  // 셋째 줄은 세그먼트 탭이 있을 때만 — 탭이 없으면 내보내기·생성 버튼은 검색 줄 오른쪽 끝으로
  const row3 = !!tabs;
  const [pagerSlot, setPagerSlot] = useState<Element | null>(null);
  // 'N개씩 보기' — 브라우저 기본 드롭다운 대신 앱 공통 Select를 풋터 오른쪽에 그린다(기본 select는 CSS로 숨김)
  const [sizeSlot, setSizeSlot] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current?.querySelector('.sft-tfoot__center') ?? null;
    if (el !== pagerSlot) setPagerSlot(el);
    const right = containerRef.current?.querySelector('.sft-tfoot__right') ?? null;
    if (right !== sizeSlot) setSizeSlot(right);
  });
  const wasLoading = useRef(false);
  // 여러 줄 셀이 있는 표 — 행 높이를 내용에 맞춰 늘린다(고정 행 높이 전제의 가상 스크롤은 끈다)
  const multiline = columns.some((c) => c.multiline);

  // 개인정보 가리기 — 내보내기의 '가려서 받기'로 고른 칸은 화면 표에서도 가리고, 내려받는 파일에도 가린다
  const [mask, setMask] = useState<Set<string>>(() => new Set());
  const maskable: MaskableColumn[] = useMemo(
    () =>
      columns
        .map((c, i) => ({ key: colKey(c, i), label: titleOf(c), kind: maskKindOf(c) }))
        .filter((c) => c.kind)
        .map(({ key, label }) => ({ key, label })),
    [columns],
  );

  // 칸 폭 계산은 무겁다(셀을 글자로 그려 잰다) — 앞쪽 행들이 바뀔 때만 다시 잰다
  // 숫자 서체(Geist Mono)가 내려오기 전에 재면 좁게 잡힌다 — 받은 뒤 한 번 다시 잰다
  const [fontReady, setFontReady] = useState(
    () => typeof document === 'undefined' || document.fonts.check("14px 'Geist Mono'", '0'),
  );
  useEffect(() => {
    if (fontReady) return;
    let alive = true;
    void document.fonts.load("400 14px 'Geist Mono'", 'R0').then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, [fontReady]);
  const widthCache = useRef<{
    sig: string;
    byCol: Map<string, { width: number; numeric: boolean }>;
  }>({
    sig: '',
    byCol: new Map(),
  });
  const rowsSig = `${fontReady ? 1 : 0}|${rows.length}|${rows
    .slice(0, SAMPLE_ROWS)
    .map((r) => String(r[rowKey] ?? ''))
    .join(',')}`;
  if (widthCache.current.sig !== rowsSig) widthCache.current = { sig: rowsSig, byCol: new Map() };
  const cachedMeasure = (c: Column, i: number) => {
    const k = `${colKey(c, i)}|${titleOf(c)}`;
    let w = widthCache.current.byCol.get(k);
    if (w === undefined) {
      w = measureColumn(c, rows);
      widthCache.current.byCol.set(k, w);
    }
    return w;
  };

  /** 이번에 잰 칸 폭(고정폭 칸만) — 표가 처음 폭을 기억하므로 데이터가 바뀌면 아래에서 다시 넣는다 */
  const autoWidths = useRef(new Map<string, number>());

  const softiumColumns: ReactColumnDef<Row>[] = useMemo(() => {
    const mapped: ReactColumnDef<Row>[] = columns.map((c, i) => {
      const key = colKey(c, i);
      const kind = maskKindOf(c);
      const measured = cachedMeasure(c, i);
      // 숫자만 있는 칸은 숫자 서체로(글자·숫자가 섞인 주소 등은 그대로)
      const num = (node: ReactNode) =>
        measured.numeric ? <span className="dt-num">{node}</span> : node;
      return {
        key,
        label: typeof c.title === 'string' ? c.title : String(c.title ?? ''),
        align: c.numeric ? 'right' : 'left',
        sortable: !!c.dataIndex,
        // 폭을 안 정한 칸은 내용 길이로(늘어나는 칸은 최소 폭으로만)
        ...(() => {
          if (c.width) return { width: c.width, minWidth: c.minWidth, flex: c.flex };
          const auto = measured.width;
          if (!c.flex) autoWidths.current.set(key, Math.max(c.minWidth ?? 0, auto));
          return c.flex
            ? { minWidth: Math.min(c.minWidth ?? 120, 120, auto), flex: c.flex }
            : { width: Math.max(c.minWidth ?? 0, auto), minWidth: c.minWidth };
        })(),
        // 내보내기 값 — 지정값 > 화면에 그린 글자 > 원본 필드 (원본만 읽으면 render로 그리는 칸이 비거나 코드로 나간다)
        exportValue: (data: Row) => {
          const v = c.exportValue
            ? c.exportValue(data)
            : c.render
              ? nodeText(c.render(data)) || null
              : (data[c.dataIndex ?? ''] as string | number | null | undefined);
          const out = v === null || v === undefined || v === '' ? null : v;
          // '가려서 받기'로 고른 칸
          return kind && out !== null && mask.has(key) ? maskValue(kind, String(out)) : out;
        },
        renderCell: ({ row }) =>
          row.data.__sk ? (
            <Skeleton width={36 + ((i * 23 + Number(row.data.__sk) * 11) % 64)} height={12} />
          ) : c.multiline ? (
            // 여러 줄 셀 — 줄마다 한 줄 말줄임, 행은 내용 높이만큼 늘어난다(base.css .dt-multiline)
            <div className="dt-cell-multiline">
              {c.render ? c.render(row.data) : String(row.data[c.dataIndex ?? ''] ?? '')}
            </div>
          ) : kind && mask.has(key) ? (
            // '가려서 받기'로 고른 칸 — 화면에서도 가린 글자로
            maskValue(kind, cellText(c, row.data))
          ) : c.render ? (
            num(c.render(row.data))
          ) : (
            num(cellValue(row.data[c.dataIndex ?? '']))
          ),
      };
    });
    // 컬럼 폭 합이 컨테이너보다 좁으면(softium Table은 넘칠 때만 줄여주고 남을 때 안 늘려줌)
    // 오른쪽에 남는 여백이 생긴다. 실제 컬럼들을 억지로 늘리는 대신, 보이지 않는 여백 컬럼 하나를
    // 끝에 붙여 그 컬럼이 남는 폭을 가져가게 한다 — 단, 페이지가 이미 flex를 직접 지정했다면
    // (예: 주소처럼 넓혀야 할 컬럼이 있는 경우) 그 의도를 존중해 추가하지 않는다.
    if (!columns.some((c) => c.flex)) {
      mapped.push({
        key: '__spacer',
        label: '',
        flex: 1,
        sortable: false,
        filterable: false,
        hideable: false,
        exportValue: () => '',
        renderCell: () => null,
      });
    }
    return mapped;
  }, [columns, rowsSig, mask]);

  // 처음 불러오기가 끝나기 전에는 '데이터가 없습니다' 대신 표 안에 자리표시 행을 깐다
  // (검색창·내보내기·등록 버튼 같은 툴바는 그대로 보인다).
  // (loading을 넘기는 화면만 — 첫 렌더에선 아직 false일 수 있어 '한 번이라도 다 받았나'로 판단)
  const loadedOnce = useRef(false);
  if (loading === false && wasLoading.current) loadedOnce.current = true;
  wasLoading.current = !!loading;
  const showSkeleton = loading !== undefined && rows.length === 0 && !loadedOnce.current;
  const skeletonRows = useMemo<Row[]>(
    () => Array.from({ length: SKELETON_ROWS }, (_, i) => ({ [rowKey]: `__sk${i}`, __sk: i + 1 })),
    [rowKey],
  );

  // 서버 검색: 표가 기억하는 검색어(srvQ)를 모든 행의 가짜 칸에 넣어 표 안 검색은 늘 통과
  const [srvQ, setSrvQ] = useState('');
  const srvRows = useMemo(
    () => (onSearch ? rows.map((r) => ({ ...r, [SRV_KEY]: srvQ })) : rows),
    [rows, onSearch, srvQ],
  );
  const table = useTable<Row>({
    data: showSkeleton ? skeletonRows : srvRows,
    columns: softiumColumns,
    getRowId: (r) => String(r[rowKey]),
    // 넘기지 않으면 softium Table이 페이지네이션을 끄고(전체 렌더) 푸터의
    // "N개씩 보기" 선택기도 감춘다.
    pageSize: pageSize ?? (fit ? FIT_PAGE_SIZE : DEFAULT_PAGE_SIZE),
  });

  const search = table.getSearch();
  const query = search.query;
  useEffect(() => {
    if (!onSearch) return;
    if (!Array.isArray(search.scope) || search.scope[0] !== SRV_KEY)
      table.setSearch({ query, scope: [SRV_KEY] });
    setSrvQ(query);
    onSearch(query);
    // onSearch는 렌더마다 새 함수일 수 있다 — 검색어가 바뀔 때만
  }, [query, !!onSearch]);

  // softium 표는 칸 폭을 처음 그릴 때 상태로 저장한다 — 데이터가 들어와 다시 잰 폭을 상태에 넣는다
  useLayoutEffect(() => {
    const widths = autoWidths.current;
    if (!widths.size) return;
    table.setColumnState((prev) =>
      prev.some((st) => widths.has(st.key) && st.width !== widths.get(st.key))
        ? prev.map((st) => (widths.has(st.key) ? { ...st, width: widths.get(st.key) } : st))
        : prev,
    );
  }, [rowsSig, softiumColumns.length]);

  // 가로 스크롤바는 좌우로 움직이는 동안만 보인다 — 움직이면 잠깐 표시(.dt-scrolling-x), 멈추면 숨김
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>('.sft-table__scroll');
    if (!el) return;
    let left = el.scrollLeft;
    let timer: number | undefined;
    const onScroll = () => {
      if (el.scrollLeft === left) return; // 세로 스크롤은 상관없다
      left = el.scrollLeft;
      el.classList.add('dt-scrolling-x');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove('dt-scrolling-x'), 900);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  // 빈 칸도 한 페이지 행 수만큼 자리를 차지하게(행이 적거나 없어도 표 높이가 같다) — 지금 고른
  // 'N개씩 보기'를 풋터에서 읽어 tbody 최소 높이로 쓴다(base.css .dt-wrap .sft-tbody)
  const basePage = pageSize ?? (fit ? FIT_PAGE_SIZE : DEFAULT_PAGE_SIZE);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // 풋터의 'N개씩 보기' 선택값
    const picked = table.getPageSize();
    const n = Number.isFinite(picked) && picked > 0 ? picked : basePage;
    if (el.style.getPropertyValue('--dt-rows') !== String(n))
      el.style.setProperty('--dt-rows', String(n));
  });

  // softium-ui Table에는 아직 로우 클릭 prop이 없어 DOM 위임으로 처리한다.
  // 로우 안 버튼/링크 클릭은 그 자체 동작만 수행하도록 무시.
  const handleClick = onRowClick
    ? (e: MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button, input, select, textarea')) return;
        const rowEl = target.closest<HTMLElement>('.sft-tbody > [role="row"]');
        if (!rowEl?.parentElement) return;
        const index = Array.prototype.indexOf.call(rowEl.parentElement.children, rowEl);
        const row = table.getRows()[index];
        if (row && !row.data.__sk) onRowClick(row.data);
      }
    : undefined;

  // 내보내기 — 라이브러리 메뉴 대신(그쪽 CSV는 BOM이 없어 엑셀에서 한글이 깨진다)
  const exportMenu = exportable ? (
    <ExportMenu
      table={table}
      fileName={exportFileName ?? 'table'}
      maskable={maskable}
      mask={mask}
      onMaskChange={setMask}
      compact={exportCompact}
    />
  ) : null;
  const hasActions = !!(exportable || toolbarActions);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={[
        'dt-wrap',
        onRowClick && !showSkeleton ? 'dt-row-clickable' : '',
        showSkeleton ? 'dt-loading' : '',
        multiline ? 'dt-multiline' : '',
        fit ? 'dt-fit' : '',
        bare ? 'dt-bare' : '',
        // 셋째 줄(탭)이 없으면 그 줄을 비우지 않고 접는다
        row3 ? '' : 'dt-no-row3',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-busy={showSkeleton || undefined}
    >
      <Table
        table={table}
        locale={i18n.language === 'ko' ? 'ko' : 'en'}
        emptyText={loading ? t('table.loading') : t('table.empty')}
        toolbarActions={
          // softium Table 툴바 = [검색(왼쪽)][toolbarActions(오른쪽)] 뿐이라, 오른쪽 컨테이너를
          // display:contents로 풀고 CSS grid 영역으로 목록 화면 공통 배치를 만든다(base.css .dt-wrap .sft-toolbar).
          //   검색 · 필터 ……… 보기 바꾸기
          //   세그먼트 탭 ……… 내보내기 · 생성 버튼
          <>
            {filters && <div className="dt-toolbar-filters">{filters}</div>}
            {/* 탭이 없으면 셋째 줄을 만들지 않고 내보내기·생성 버튼을 검색 줄 오른쪽 끝에 둔다 */}
            {(viewSwitch || (!row3 && hasActions)) && (
              <div className="dt-toolbar-view">
                {viewSwitch}
                {!row3 && exportable && exportMenu}
                {!row3 && toolbarActions}
              </div>
            )}
            {tabs && <div className="dt-toolbar-tabs">{tabs}</div>}
            {row3 && hasActions && (
              <div className="dt-toolbar-actions">
                {exportable && exportMenu}
                {toolbarActions}
              </div>
            )}
          </>
        }
        disableVirtualization={multiline}
      />
      {sizeSlot &&
        table.getPageSize() > 0 &&
        createPortal(
          <span className="dt-pagesize">
            <Select
              size="sm"
              value={String(table.getPageSize())}
              onValueChange={(v) => table.setPageSize(Number(v))}
              options={PAGE_SIZES.map((n) => ({
                value: String(n),
                label: t('table.perPage', { n }),
              }))}
              aria-label={t('table.rowsPerPage')}
            />
          </span>,
          sizeSlot,
        )}
      {pagerSlot &&
        createPortal(
          <nav className="sft-pager dt-pager-single" aria-label="pagination">
            <button type="button" className="sft-pager__btn sft-pager__btn--nav" disabled>
              <ChevronLeft size={14} aria-hidden />
              <span className="sft-pager__navlabel">{t('table.prev')}</span>
            </button>
            <button
              type="button"
              className="sft-pager__btn sft-pager__btn--page"
              data-active="true"
              aria-current="page"
            >
              1
            </button>
            <button type="button" className="sft-pager__btn sft-pager__btn--nav" disabled>
              <span className="sft-pager__navlabel">{t('table.next')}</span>
              <ChevronRight size={14} aria-hidden />
            </button>
          </nav>,
          pagerSlot,
        )}
    </div>
  );
}
