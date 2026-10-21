import { useCallback, useEffect, useState } from 'react';
import { ACCESS_LABEL, HANDLING_LABEL } from '@tongin/shared';

/** 서버에서 오는 handling은 문자열이라 넓은 타입으로 받는다 */
const HANDLING_TEXT: Record<string, string> = HANDLING_LABEL;
const ACCESS_TEXT: Record<string, string> = ACCESS_LABEL;
import { api } from '../lib/api';
import { Badge, DataTable, Spinner, type Column, type Row } from './ui';

interface Line {
  id: string;
  itemName: string;
  qty: string | number;
  cbm: string | number;
  handling: string;
  zoneId?: string | null;
}
interface Addon {
  id: string;
  name: string;
  qty: string | number;
  unitPrice: string | number;
  amount: string | number;
  memo?: string | null;
}
interface Zone {
  id: string;
  name: string;
}
interface EstimateDetail {
  id: string;
  estimateNo: string;
  status: string;
  totalCbm: string | number;
  moveAmount: string | number | null;
  vatMode: string;
  vatAmount: string | number | null;
  totalAmount: string | number | null;
  depositAmount: string | number | null;
  balanceAmount: string | number | null;
  zones: Zone[];
  lines: Line[];
  addons: Addon[];
  fromPyeong: number | null;
  toPyeong: number | null;
  fromAccess: string;
  fromAccessNote: string | null;
  toAccess: string;
  toAccessNote: string | null;
}

const condition = (pyeong: number | null, access: string, note: string | null) =>
  [
    pyeong != null ? `${pyeong}평` : null,
    `${ACCESS_TEXT[access] ?? access}${access === 'ETC' && note ? `(${note})` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

const won = (v: unknown) => (v == null || v === '' ? '-' : `${Number(v).toLocaleString()}원`);

function Row2({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ flex: 1, color: 'var(--ark-color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? 17 : undefined }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ark-color-text-secondary)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * 접수 케이스 안에서 견적 내용을 그대로 펼쳐 보여주는 패널.
 * 목록에서 한 번 더 눌러 들어가지 않고 케이스 화면에서 바로 읽히도록 하는 것이 목적이라
 * 조회 전용이다 — 수정은 견적 상세 화면에서 한다.
 */
export function EstimatePanel({ estimateId }: { estimateId: string }) {
  const [data, setData] = useState<EstimateDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<EstimateDetail>(`/estimates/${estimateId}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return (
      <span style={{ color: 'var(--ark-color-text-tertiary)' }}>견적을 불러오지 못했습니다.</span>
    );
  }

  const zoneName = new Map(data.zones.map((z) => [z.id, z.name]));
  const lineColumns: Column[] = [
    { title: '구역', render: (r) => zoneName.get(String(r.zoneId)) ?? '-' },
    { title: '품목', dataIndex: 'itemName' },
    { title: '수량', numeric: true, render: (r) => String(Number(r.qty)) },
    { title: 'CBM', numeric: true, render: (r) => String(Number(r.cbm)) },
    { title: '처리', render: (r) => HANDLING_TEXT[String(r.handling)] ?? String(r.handling) },
  ];

  // 물량 요약 — 처리구분별로 나눠 본다(운반/경유/방치/폐기)
  const cbmBy = (h: string) =>
    data.lines.filter((l) => l.handling === h).reduce((s, l) => s + Number(l.cbm ?? 0), 0);
  const addonTotal = data.addons.reduce((s, a) => s + Number(a.amount ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Section title="물량">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Badge variant="subtle" color="info">
            전체 {Number(data.totalCbm)} CBM
          </Badge>
          <Badge variant="subtle">운반 {cbmBy('CARRY')}</Badge>
          <Badge variant="subtle">경유 {cbmBy('VIA')}</Badge>
          <Badge variant="subtle">방치 {cbmBy('LEAVE')}</Badge>
          <Badge variant="subtle">폐기 {cbmBy('DISPOSE')}</Badge>
        </div>
      </Section>

      <Section title="작업 조건">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Row2
            label="전"
            value={condition(data.fromPyeong, data.fromAccess, data.fromAccessNote)}
          />
          <Row2 label="후" value={condition(data.toPyeong, data.toAccess, data.toAccessNote)} />
        </div>
      </Section>

      <Section title={`품목 (${data.lines.length})`}>
        {data.lines.length ? (
          <DataTable columns={lineColumns} rows={data.lines as unknown as Row[]} pageSize={0} />
        ) : (
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>등록된 품목이 없습니다</span>
        )}
      </Section>

      <Section title={`옵션 상품 (${data.addons.length})`}>
        {data.addons.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.addons.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {a.name}
                  {a.memo && (
                    <span style={{ color: 'var(--ark-color-text-tertiary)' }}> · {a.memo}</span>
                  )}
                </span>
                <span style={{ color: 'var(--ark-color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {won(a.unitPrice)} × {Number(a.qty)}
                </span>
                <b style={{ minWidth: 96, textAlign: 'right' }}>{won(a.amount)}</b>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>선택한 옵션이 없습니다</span>
        )}
      </Section>

      <Section title="금액">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row2 label="이사비용" value={won(data.moveAmount)} />
          <Row2 label="옵션 합계" value={won(addonTotal)} />
          <Row2
            label={`부가세 (${data.vatMode === 'INCLUDED' ? '포함' : '불포함'})`}
            value={data.vatMode === 'INCLUDED' ? won(data.vatAmount) : '별도'}
          />
          <div style={{ borderTop: '1px solid var(--ark-color-border)', paddingTop: 6 }}>
            <Row2 label="총비용" value={won(data.totalAmount)} strong />
          </div>
          <Row2 label="계약금" value={won(data.depositAmount)} />
          <Row2 label="잔금" value={won(data.balanceAmount)} />
        </div>
      </Section>
    </div>
  );
}
