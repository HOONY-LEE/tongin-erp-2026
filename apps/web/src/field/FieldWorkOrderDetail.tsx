import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { Badge, Button, Spinner, useToast } from '../components/ui';
import {
  formatDay,
  HANDLING_LABEL,
  WORK_STATUS,
  type FieldLine,
  type FieldWorkOrderDetail as Detail,
} from './fieldTypes';

/** 작업지시서 — 현장에서 이 화면 하나로 일이 되게. */
export default function FieldWorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setD(await api<Detail>(`/field/work-orders/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '조회에 실패했습니다' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (kind: 'start' | 'complete') => {
    setActing(true);
    try {
      await api(`/field/work-orders/${id}/${kind}`, { method: 'POST' });
      toast({
        type: 'success',
        title: kind === 'start' ? '작업을 시작했습니다' : '작업을 완료했습니다',
      });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리에 실패했습니다' });
    } finally {
      setActing(false);
    }
  };

  if (loading || !d) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const st = WORK_STATUS[d.status] ?? { label: d.status, color: 'neutral' as const };
  const allLines = [...d.zones.flatMap((z) => z.lines), ...d.looseLines];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 96 }}>
      <button
        type="button"
        onClick={() => navigate('/field')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          border: 'none',
          background: 'transparent',
          padding: 0,
          color: 'var(--ark-color-text-secondary)',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={16} /> 내 작업
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{d.customerName}</h1>
        <Badge variant="subtle" color={st.color}>
          {st.label}
        </Badge>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ark-color-text-tertiary)', marginTop: -8 }}>
        {formatDay(d.scheduledDate)} · {d.workNo}
      </div>

      {d.customerPhone && (
        <a
          href={`tel:${d.customerPhone}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 14,
            borderRadius: 12,
            background: 'var(--ark-color-primary-500)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            textDecoration: 'none',
          }}
        >
          <Phone size={18} /> 고객 전화 {formatPhone(d.customerPhone)}
        </a>
      )}

      <Card title="이사 경로">
        <Place
          label="출발"
          addr={d.fromAddr}
          detail={d.fromAddrDetail}
          zipcode={d.fromZipcode}
          lat={d.fromLat}
          lng={d.fromLng}
          pyeong={d.fromPyeong}
          elevator={d.fromElevator}
        />
        <div style={{ height: 1, background: 'var(--ark-color-gray-200)', margin: '12px 0' }} />
        <Place
          label="도착"
          addr={d.toAddr}
          detail={d.toAddrDetail}
          zipcode={d.toZipcode}
          lat={d.toLat}
          lng={d.toLng}
          pyeong={d.toPyeong}
          elevator={d.toElevator}
        />
      </Card>

      {d.workInstructions && (
        <Card title="작업지시">
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {d.workInstructions}
          </p>
        </Card>
      )}

      {d.assignments.length > 0 && (
        <Card title="배정">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.assignments.map((a) => (
              <Badge
                key={a.id}
                variant="subtle"
                color={a.resourceType === 'CREW' ? 'primary' : 'info'}
              >
                {a.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card title={`품목 (${allLines.length}) · 총 ${d.totalCbm}CBM`}>
        {allLines.length === 0 ? (
          <span style={{ color: 'var(--ark-color-text-tertiary)', fontSize: 14 }}>
            등록된 품목이 없습니다
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {d.zones.map((z) => (
              <div key={z.id}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ark-color-text-secondary)',
                    marginBottom: 6,
                  }}
                >
                  {z.name}
                </div>
                <LineList lines={z.lines} />
              </div>
            ))}
            {d.looseLines.length > 0 && <LineList lines={d.looseLines} />}
          </div>
        )}
      </Card>

      {/* 시작·완료는 화면 하단 고정 — 장갑 낀 손으로도 누르게 크게 */}
      {(d.status === 'ASSIGNED' || d.status === 'IN_PROGRESS') && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            background: 'var(--ark-color-bg)',
            borderTop: '1px solid var(--ark-color-gray-200)',
          }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <Button
              variant="primary"
              size="lg"
              disabled={acting}
              onClick={() => void act(d.status === 'ASSIGNED' ? 'start' : 'complete')}
              style={{ width: '100%', height: 52, fontSize: 17, fontWeight: 700 }}
            >
              {d.status === 'ASSIGNED' ? '작업 시작' : '작업 완료'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 16,
        borderRadius: 12,
        border: '1px solid var(--ark-color-gray-200)',
        background: 'var(--ark-color-bg)',
      }}
    >
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{title}</h2>
      {children}
    </section>
  );
}

function Place({
  label,
  addr,
  detail,
  zipcode,
  lat,
  lng,
  pyeong,
  elevator,
}: {
  label: string;
  addr: string | null;
  detail: string | null;
  zipcode: string | null;
  lat: number | null;
  lng: number | null;
  pyeong: string | null;
  elevator: boolean | null;
}) {
  if (!addr) {
    return (
      <div style={{ fontSize: 14, color: 'var(--ark-color-text-tertiary)' }}>{label} · 미입력</div>
    );
  }
  // 좌표가 있으면 핀으로, 없으면 검색으로 — 현장에서 바로 길찾기로 넘어가게
  const mapUrl =
    lat && lng
      ? `https://map.kakao.com/link/to/${encodeURIComponent(addr)},${lat},${lng}`
      : `https://map.kakao.com/?q=${encodeURIComponent(addr)}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ark-color-primary-600)' }}>
          {label}
        </span>
        {pyeong && (
          <span style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>{pyeong}평</span>
        )}
        {elevator != null && (
          <Badge variant="subtle" color={elevator ? 'success' : 'warning'}>
            {elevator ? '엘리베이터 있음' : '엘리베이터 없음'}
          </Badge>
        )}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.5 }}>
        {zipcode && (
          <span style={{ color: 'var(--ark-color-text-tertiary)', fontSize: 13 }}>
            ({zipcode}){' '}
          </span>
        )}
        {addr}
        {detail ? ` ${detail}` : ''}
      </div>
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid var(--ark-color-gray-200)',
          fontSize: 14,
          color: 'var(--ark-color-text)',
          textDecoration: 'none',
        }}
      >
        <MapPin size={14} /> 길찾기
      </a>
    </div>
  );
}

function LineList({ lines }: { lines: FieldLine[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((l) => (
        <div
          key={l.id}
          style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 15, minWidth: 0 }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{l.itemName}</span>
          {l.handling !== 'CARRY' && (
            <Badge variant="subtle" color="warning">
              {HANDLING_LABEL[l.handling] ?? l.handling}
            </Badge>
          )}
          <span style={{ fontWeight: 700 }}>{Number(l.qty)}개</span>
        </div>
      ))}
    </div>
  );
}
