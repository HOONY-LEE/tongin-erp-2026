import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Select } from '@sunghoon_lee/akron-ui';
import {
  STUDIO_DATASET_MAP,
  type DashItem,
  type StudioControl,
  type StudioParams,
  type StudioResult,
  type StudioPlace,
  type StudioSpec,
} from '@tongin/shared';
import { ApiError } from '../../../lib/api';
import { FilterButton, SegmentedControl, Skeleton, type FilterField } from '../../ui';
import { VizBody } from '../viz/Charts';
import { ctrlLabel, optLabel } from './studioLabels';
import styles from './studio.module.css';

/**
 * 만든 위젯 한 칸의 본문 — 부제·조작 요소(세그먼트 탭·드롭다운·필터) + 차트.
 * 데이터는 load(params)로 받는다(스튜디오 미리보기는 설계서로, 대시보드는 저장된 위젯 id로).
 */
export function StudioWidget({
  spec,
  load,
  showSubtitle = true,
  headerSlot,
  chartOnly = false,
}: {
  spec: StudioSpec;
  load: (params: StudioParams) => Promise<StudioResult>;
  showSubtitle?: boolean;
  /** 위젯 제목 줄의 오른쪽 칸 — '제목 줄'에 놓은 조작 요소가 여기로 간다 */
  headerSlot?: HTMLElement | null;
  /** 차트만(목록 카드의 작은 미리보기) — 탭·드롭다운·필터는 그리지 않는다 */
  chartOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useState<StudioParams>({});
  const [res, setRes] = useState<StudioResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const specKey = JSON.stringify(spec);
  // 설계서가 바뀌면(스튜디오에서 고칠 때) 조작 값을 처음으로
  useEffect(() => setParams({}), [specKey]);

  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const paramKey = JSON.stringify(params);
  useEffect(() => {
    const my = ++seq.current;
    setBusy(true);
    const h = setTimeout(() => {
      loadRef
        .current(params)
        .then((r) => {
          if (my !== seq.current) return;
          setRes(r);
          setErr('');
        })
        .catch((e) => {
          if (my !== seq.current) return;
          setErr(e instanceof ApiError ? e.message : t('studio.loadFailed'));
        })
        .finally(() => my === seq.current && setBusy(false));
    }, 120);
    return () => clearTimeout(h);
  }, [specKey, paramKey]);

  const ds = STUDIO_DATASET_MAP.get(spec.dataset);
  const multiOrg = res?.multiOrg ?? true;
  /** 한 지점만 보는 사람에게 '지점별'은 숨긴다 */
  const visibleOptions = (c: Extract<StudioControl, { kind: 'segment' | 'dropdown' }>) =>
    c.target === 'dimension' && !multiOrg ? c.options.filter((o) => o !== 'org') : c.options;
  const current = (c: Extract<StudioControl, { kind: 'segment' | 'dropdown' }>): string => {
    const v =
      c.target === 'grain'
        ? (params.grain ?? spec.grain)
        : c.target === 'dimension'
          ? params.dimension !== undefined
            ? params.dimension
            : spec.dimension
          : c.target === 'measure'
            ? (params.measure ?? spec.measure)
            : c.target === 'period'
              ? (params.period ?? spec.period)
              : (params.viz ?? spec.viz);
    return String(v ?? '');
  };
  const setCtl = (target: string, v: string) =>
    setParams((p) => ({ ...p, [target]: v }) as StudioParams);

  const curDim = params.dimension !== undefined ? params.dimension : spec.dimension;
  const timeDim = !!ds?.dimensions.find((d) => d.key === curDim && d.kind === 'time');
  const controls = chartOnly ? [] : (spec.controls ?? []);
  const selects = controls.filter(
    (c): c is Extract<StudioControl, { kind: 'segment' | 'dropdown' }> => c.kind !== 'filter',
  );
  const filterCtl = controls.filter(
    (c): c is Extract<StudioControl, { kind: 'filter' }> => c.kind === 'filter',
  );
  const filterFields: FilterField[] = filterCtl.map((c) => ({
    key: c.dim,
    label: c.label || ctrlLabel(spec.dataset, c.dim),
    type: 'multi',
    options: res?.options[c.dim] ?? [],
  }));

  const viz = params.viz ?? spec.viz;
  const fakeItem = useMemo<DashItem>(
    () => ({ id: 'studio', widget: 'studio', viz, x: 0, y: 0, w: 6, h: 4 }),
    [viz],
  );

  // 조작 요소를 자리별로 — 제목 줄(headerSlot이 있을 때)·위 왼쪽·위 오른쪽·아래
  const placed: { place: StudioPlace; node: ReactNode }[] = [];
  const where = (p?: StudioPlace): StudioPlace =>
    p === 'title' && !headerSlot ? 'right' : (p ?? 'left');
  selects.forEach((c, i) => {
    const opts = visibleOptions(c);
    if (opts.length < 2) return;
    // 시간 단위 탭은 날짜로 묶을 때만(지점별·상품별로 바꾸면 숨긴다)
    if (c.target === 'grain' && !timeDim) return;
    const options = opts.map((o) => ({ value: o, label: optLabel(spec.dataset, c.target, o) }));
    placed.push({
      place: where(c.place),
      node:
        c.kind === 'segment' ? (
          <SegmentedControl
            key={`s${i}`}
            size="sm"
            value={current(c)}
            onChange={(v) => setCtl(c.target, v)}
            options={options}
          />
        ) : (
          <div key={`s${i}`} className={styles.select}>
            <Select
              size="sm"
              value={current(c)}
              onValueChange={(v) => setCtl(c.target, v)}
              options={options}
              aria-label={c.label || t(`studio.target.${c.target}`)}
            />
          </div>
        ),
    });
  });
  if (filterCtl.length)
    placed.push({
      place: where(filterCtl[0].place),
      node: (
        <FilterButton
          key="filter"
          fields={filterFields}
          value={params.filters ?? {}}
          onChange={(f) =>
            setParams((p) => ({
              ...p,
              filters: Object.fromEntries(
                Object.entries(f).filter(([, v]) => Array.isArray(v) && v.length),
              ) as Record<string, string[]>,
            }))
          }
        />
      ),
    });
  const at = (p: StudioPlace) => placed.filter((x) => x.place === p).map((x) => x.node);
  const left = at('left');
  const right = at('right');
  const bottom = at('bottom');
  const head = at('title');

  return (
    <div className={styles.widget}>
      {headerSlot &&
        head.length > 0 &&
        createPortal(<span className={styles.headCtl}>{head}</span>, headerSlot)}
      {showSubtitle && spec.subtitle && <p className={styles.subtitle}>{spec.subtitle}</p>}
      {(left.length > 0 || right.length > 0) && (
        <div className={styles.controls}>
          {left}
          {right.length > 0 && <span className={styles.ctlRight}>{right}</span>}
        </div>
      )}
      <div className={`${styles.chart} ${busy && res ? styles.dim : ''}`}>
        {err ? (
          <div className={styles.error}>{err}</div>
        ) : !res ? (
          <Skeleton height="100%" radius={8} />
        ) : (
          <VizBody viz={viz} data={res.data} item={fakeItem} />
        )}
      </div>
      {bottom.length > 0 && <div className={styles.controls}>{bottom}</div>}
      {!ds && <div className={styles.error}>{t('studio.badDataset')}</div>}
    </div>
  );
}
