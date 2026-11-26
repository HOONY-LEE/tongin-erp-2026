import { useEffect, useState } from 'react';
import type { DashData, DashDataResult, DashFormat, DashItem, DashWidgetDef } from '@tongin/shared';
import { api } from '../../../lib/api';
import { localizeServerLabels } from '../../../i18n/codes';
import { Skeleton } from '../../ui';
import { VizBody } from '../viz/Charts';

/**
 * 위젯 스튜디오 목록의 시스템 위젯 카드 미리보기 — 대시보드와 같은 그림(VizBody)으로 그린다.
 * 실제 데이터를 먼저 받고, 비었거나 0뿐이면(데이터가 적은 서버·권한 없는 위젯) 같은 모양의 예시 데이터로 채운다.
 * 예시는 카드 보기 전용이다(대시보드에는 늘 실제 데이터).
 */

/** 위젯 키·제목으로 단위 짐작 — 금액·비율·건수 */
function formatOf(def: DashWidgetDef): DashFormat {
  const k = `${def.key} ${def.title}`;
  if (/Rate|conversion|leaveUsage|률|율/.test(k)) return 'percent';
  if (
    /revenue|Revenue|collected|outstanding|Outstanding|Pipeline|avgContract|byPartner|매출|금액|수금/.test(
      k,
    )
  )
    return 'won';
  return 'count';
}

/** 키로 고르는 예시 항목 이름 */
function labelsOf(key: string): string[] {
  if (/Region/.test(key)) return ['서울', '경기', '부산', '인천', '대구', '대전'];
  if (/Branch|ranking/.test(key))
    return ['강남1호점', '송파점', '해운대점', '분당구미', '인천송도점'];
  if (/funnel/.test(key)) return ['접수', '상담', '견적', '계약', '작업 완료'];
  if (/Source/.test(key)) return ['전화', '홈페이지', '제휴', '재이용', '지인 소개'];
  if (/Grade/.test(key)) return ['VIP', '우수', '일반', '신규'];
  if (/ServiceLine/.test(key)) return ['이사', '리빙케어', '청소', '보관'];
  if (/Owner/.test(key)) return ['김민준', '이서연', '박지훈', '최유진', '정하늘'];
  if (/Partner/.test(key)) return ['한빛전자', '대한물산', '미래건설', '새솔유통'];
  if (/leaveUsage/.test(key)) return ['경영관리', '고객관리부', '마케팅', '홈플래너', '무브제'];
  if (/Status/.test(key)) return ['접수', '진행 중', '완료', '취소'];
  return ['항목 A', '항목 B', '항목 C', '항목 D'];
}

/** 크기 기준값 — 단위에 맞는 그럴듯한 숫자 */
const baseOf = (f: DashFormat) => (f === 'won' ? 42_000_000 : f === 'percent' ? 72 : 48);
const STEPS = [1, 0.78, 0.61, 0.47, 0.35, 0.26];
/** 같은 위젯은 늘 같은 모양(키로 만든 0~1 값) */
function jitter(key: string, i: number) {
  let h = 2166136261;
  for (const ch of `${key}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
const round = (v: number, f: DashFormat) =>
  f === 'won'
    ? Math.round(v / 10_000) * 10_000
    : f === 'percent'
      ? Math.round(v * 10) / 10
      : Math.round(v);

const NAMES = ['김민준', '이서연', '박지훈', '최유진', '정하늘', '한지우'];
const TEXTS = [
  '포장이사 상담',
  '사무실 이전 견적',
  '보관 이사 문의',
  '에어컨 이전 설치',
  '입주 청소',
];
const STATUS_TEXT = ['접수', '진행 중', '완료', '대기'];
const CITIES: { label: string; lat: number; lng: number }[] = [
  { label: '서울', lat: 37.5665, lng: 126.978 },
  { label: '부산', lat: 35.1796, lng: 129.0756 },
  { label: '대구', lat: 35.8714, lng: 128.6014 },
  { label: '인천', lat: 37.4563, lng: 126.7052 },
  { label: '대전', lat: 36.3504, lng: 127.3845 },
  { label: '광주', lat: 35.1595, lng: 126.8526 },
  { label: '수원', lat: 37.2636, lng: 127.0286 },
];

const ymd = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

/** 예시 데이터 — 위젯 모양대로. rows는 받은 칸(columns)이 있으면 그 칸을 채운다 */
function sampleFor(def: DashWidgetDef, real?: DashData | null): DashData | null {
  const f = formatOf(def);
  const base = baseOf(f);
  const k = def.key;
  switch (def.shape) {
    case 'value': {
      const value = round(base * (0.8 + jitter(k, 0) * 0.4), f);
      return {
        shape: 'value',
        format: f,
        value: f === 'percent' ? Math.min(value, 96) : value,
        previous: round(value * 0.88, f),
        ...(f === 'percent' ? { max: 100 } : {}),
      };
    }
    case 'category': {
      const labels = labelsOf(k);
      return {
        shape: 'category',
        format: f,
        // 키 = 이름(시도 이름이면 지도 칸과 맞는다)
        items: labels.map((label, i) => ({
          key: label,
          label,
          value: round(base * (STEPS[i] ?? 0.2) * (0.9 + jitter(k, i) * 0.2), f),
        })),
      };
    }
    case 'series': {
      const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        return d;
      });
      return {
        shape: 'series',
        format: f,
        unit: 'month',
        points: months.map((d, i) => ({
          x: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: `${d.getMonth() + 1}월`,
          value: round(base * (0.55 + 0.35 * Math.sin(i / 2.2) + jitter(k, i) * 0.25), f),
        })),
      };
    }
    case 'matrix': {
      const rows = /weekHour/.test(k)
        ? ['월', '화', '수', '목', '금', '토', '일']
        : /branchMonth/.test(k)
          ? labelsOf('Branch')
          : ['1주', '2주', '3주', '4주', '5주'];
      const cols = /weekHour/.test(k)
        ? ['9시', '11시', '13시', '15시', '17시', '19시']
        : /branchMonth/.test(k)
          ? ['7월', '8월', '9월', '10월', '11월']
          : ['월', '화', '수', '목', '금', '토', '일'];
      return {
        shape: 'matrix',
        format: 'count',
        rows,
        cols,
        cells: rows.map((_, r) => cols.map((__, c) => Math.round(2 + jitter(k, r * 31 + c) * 14))),
      };
    }
    case 'rows': {
      const columns =
        real?.shape === 'rows' && real.columns.length
          ? real.columns
          : [
              { key: 'title', label: '내용', format: 'text' as const },
              { key: 'name', label: '담당', format: 'text' as const },
              { key: 'status', label: '상태', format: 'text' as const },
              { key: 'at', label: '날짜', format: 'date' as const },
            ];
      const cell = (col: (typeof columns)[number], i: number): string | number => {
        const lbl = `${col.key} ${col.label}`;
        if (col.format === 'date') return ymd(i * 2 + 1);
        if (col.format === 'won') return round(2_400_000 + jitter(k, i) * 3_000_000, 'won');
        if (col.format === 'percent') return round(40 + jitter(k, i) * 50, 'percent');
        if (col.format === 'count' || col.format === 'number')
          return Math.round(1 + jitter(k, i) * 20);
        if (/name|Name|고객|담당|이름|신청|사람|직원/.test(lbl)) return NAMES[i % NAMES.length];
        if (/status|상태/.test(lbl)) return STATUS_TEXT[i % STATUS_TEXT.length];
        if (/no|No|번호/.test(lbl)) return `R2611${String(20 + i).padStart(2, '0')}00${i}`;
        if (/branch|org|지점|조직/.test(lbl)) return labelsOf('Branch')[i % 5];
        return TEXTS[i % TEXTS.length];
      };
      return {
        shape: 'rows',
        columns,
        rows: Array.from({ length: 5 }, (_, i) =>
          Object.fromEntries(columns.map((c) => [c.key, cell(c, i)])),
        ),
      };
    }
    case 'points':
      return {
        shape: 'points',
        format: f,
        points: CITIES.map((c, i) => ({
          key: `p${i}`,
          label: c.label,
          lat: c.lat,
          lng: c.lng,
          value: round(base * (STEPS[i] ?? 0.2), f),
        })),
      };
    default:
      return real ?? null;
  }
}

/** 실제 데이터가 비었거나 0뿐인지 */
function isEmpty(d: DashData): boolean {
  switch (d.shape) {
    case 'value':
      return !d.value;
    case 'category':
      return !d.items.some((x) => x.value);
    case 'series':
      return !d.points.some((x) => x.value);
    case 'matrix':
      return !d.cells.some((r) => r.some(Boolean));
    case 'rows':
      return !d.rows.length;
    case 'points':
      return !d.points.length;
    default:
      return false;
  }
}

/** 시스템 위젯 미리보기 데이터 — 한 번에 받고(대시보드와 같은 API), 빈 것은 예시로 */
export function useSystemPreviewData(defs: DashWidgetDef[]) {
  const [data, setData] = useState<Record<string, DashData | null> | null>(null);
  const keys = defs.map((d) => d.key).join(',');
  useEffect(() => {
    let alive = true;
    const want = defs.filter((d) => d.shape !== 'embed' && d.shape !== 'text');
    const fill = (res: Record<string, DashDataResult>) => {
      const out: Record<string, DashData | null> = {};
      for (const d of want) {
        const r = res[d.key];
        out[d.key] = r?.ok && !isEmpty(r.data) ? r.data : sampleFor(d, r?.ok ? r.data : null);
      }
      return out;
    };
    // 한 번에 묻는 위젯 수에 한도(60)가 있어 40개씩 나눠 묻는다
    const chunks: DashWidgetDef[][] = [];
    for (let i = 0; i < want.length; i += 40) chunks.push(want.slice(i, i + 40));
    Promise.all(
      chunks.map((part) =>
        api<Record<string, DashDataResult>>('/dashboards/data', {
          method: 'POST',
          body: JSON.stringify({
            items: part.map((d) => ({
              id: d.key,
              widget: d.key,
              period: d.period,
              metric: d.metric,
            })),
          }),
        }).catch(() => ({}) as Record<string, DashDataResult>),
      ),
    )
      .then((parts) => alive && setData(fill(localizeServerLabels(Object.assign({}, ...parts)))))
      .catch(() => alive && setData(fill({})));
    return () => {
      alive = false;
    };
    // keys가 위젯 목록을 대표한다
  }, [keys]);
  return data;
}

/** 카드 안 그림 — 대시보드 위젯 본문과 같은 컴포넌트 */
export function SystemWidgetPreview({
  def,
  data,
}: {
  def: DashWidgetDef;
  data: DashData | null | undefined;
}) {
  if (data === undefined) return <Skeleton height="100%" radius={8} />;
  const item: DashItem = {
    id: `preview-${def.key}`,
    widget: def.key,
    viz: def.viz[0],
    x: 0,
    y: 0,
    w: def.size.w,
    h: def.size.h,
    period: def.period,
    metric: def.metric,
  };
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <VizBody viz={item.viz} data={data} item={item} />
    </div>
  );
}
