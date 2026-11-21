import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { summarizeVolume } from '@tongin/shared';

/** 서버에서 오는 handling은 문자열이라 넓은 타입으로 받는다 */
const HANDLING_TEXT: Record<string, string> = HANDLING_LABEL;
const ACCESS_TEXT: Record<string, string> = ACCESS_LABEL;
import { api } from '../lib/api';
import { Badge, DataTable, type Column, type Row, SkeletonText } from './ui';
import { fs } from '../lib/fontScale';
import { ACCESS_LABEL, HANDLING_LABEL, VOLUME_UNIT_LABEL } from '../i18n/codes';

interface Line {
  id: string;
  itemName: string;
  qty: string | number;
  cbm: string | number;
  ton?: string | number | null;
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
  /** 처리방법 이름(상품관리 › 처리방법) */
  moveCatalog?: { handlings: { code: string; name: string; bucket: string }[] };
  volumeUnit?: 'CBM' | 'TON';
  fromPyeong: number | null;
  toPyeong: number | null;
  fromAccess: string;
  fromAccessNote: string | null;
  toAccess: string;
  toAccessNote: string | null;
}

const condition = (pyeong: number | null, access: string, note: string | null) =>
  [
    pyeong != null ? i18n.t('est.pyeongN', { v0: pyeong }) : null,
    `${ACCESS_TEXT[access] ?? access}${access === 'ETC' && note ? `(${note})` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

const won = (v: unknown) =>
  v == null || v === '' ? '-' : i18n.t('est.won', { v0: Number(v).toLocaleString() });

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
      <div style={{ fontSize: fs(13), fontWeight: 600, color: 'var(--ark-color-text-secondary)' }}>
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
  const { t } = useTranslation();
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
      <div style={{ padding: 16 }}>
        <SkeletonText lines={4} />
      </div>
    );
  }
  if (!data) {
    return (
      <span style={{ color: 'var(--ark-color-text-tertiary)' }}>{t('est.estLoadFailed')}</span>
    );
  }

  const zoneName = new Map(data.zones.map((z) => [z.id, z.name]));
  const handlingName: Record<string, string> = {
    ...HANDLING_TEXT,
    ...Object.fromEntries((data.moveCatalog?.handlings ?? []).map((h) => [h.code, h.name])),
  };
  const unit = data.volumeUnit ?? 'CBM';
  const unitText = VOLUME_UNIT_LABEL[unit];
  const lineColumns: Column[] = [
    { title: t('est.zone'), render: (r) => zoneName.get(String(r.zoneId)) ?? '-' },
    { title: t('est.itemCol'), dataIndex: 'itemName' },
    { title: t('est.qty'), numeric: true, render: (r) => String(Number(r.qty)) },
    {
      title: unitText,
      numeric: true,
      render: (r) => String(Number((unit === 'TON' ? r.ton : r.cbm) ?? 0)),
    },
    {
      title: t('est.handlingCol'),
      render: (r) => handlingName[String(r.handling)] ?? String(r.handling),
    },
  ];

  // 물량 요약 — 처리방법의 물량 칸대로(이사·경유·폐기, '물량 제외'는 뺀다)
  const vol = summarizeVolume(data.lines, {
    unit,
    buckets: data.moveCatalog
      ? Object.fromEntries(data.moveCatalog.handlings.map((h) => [h.code, h.bucket]))
      : undefined,
  });
  const addonTotal = data.addons.reduce((s, a) => s + Number(a.amount ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Section title={t('est.vol.title')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Badge variant="subtle" color="info">
            {t('est.all')} {vol.total} {unitText}
          </Badge>
          <Badge variant="subtle">
            {t('est.moving')} {vol.moving}
          </Badge>
          <Badge variant="subtle">
            {t('est.transit')} {vol.transit}
          </Badge>
          <Badge variant="subtle">
            {t('est.discard')} {vol.discard}
          </Badge>
        </div>
      </Section>

      <Section title={t('est.conditions')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Row2
            label={t('est.before')}
            value={condition(data.fromPyeong, data.fromAccess, data.fromAccessNote)}
          />
          <Row2
            label={t('est.after')}
            value={condition(data.toPyeong, data.toAccess, data.toAccessNote)}
          />
        </div>
      </Section>

      <Section title={t('est.itemsN', { v0: data.lines.length })}>
        {data.lines.length ? (
          <DataTable columns={lineColumns} rows={data.lines as unknown as Row[]} pageSize={0} />
        ) : (
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>{t('est.noItems')}</span>
        )}
      </Section>

      <Section title={t('est.addonsN', { v0: data.addons.length })}>
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
          <span style={{ color: 'var(--ark-color-text-tertiary)' }}>{t('est.noOptions')}</span>
        )}
      </Section>

      <Section title={t('est.amountTitle')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row2 label={t('est.moveCost')} value={won(data.moveAmount)} />
          <Row2 label={t('est.optTotal')} value={won(addonTotal)} />
          <Row2
            label={t('est.vatOf', {
              v0: data.vatMode === 'INCLUDED' ? t('est.vatIn') : t('est.vatEx'),
            })}
            value={data.vatMode === 'INCLUDED' ? won(data.vatAmount) : t('est.separate')}
          />
          <div style={{ borderTop: '1px solid var(--ark-color-border)', paddingTop: 6 }}>
            <Row2 label={t('est.total2')} value={won(data.totalAmount)} strong />
          </div>
          <Row2 label={t('est.deposit')} value={won(data.depositAmount)} />
          <Row2 label={t('est.balance')} value={won(data.balanceAmount)} />
        </div>
      </Section>
    </div>
  );
}
