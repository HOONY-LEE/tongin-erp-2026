import { MapPin } from 'lucide-react';

interface Props {
  label?: string;
  zipcode?: string | null;
  addr?: string | null;
  addrDetail?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
}

/** 구조적 주소(우편번호·도로명·상세) 표시 + 카카오맵 링크(좌표 있으면 핀, 없으면 검색). */
export function AddressView({ label, zipcode, addr, addrDetail, lat, lng }: Props) {
  if (!addr) {
    return (
      <span style={{ color: 'var(--ark-color-text-tertiary)' }}>{label ? `${label} ` : ''}-</span>
    );
  }
  const full = [addr, addrDetail].filter(Boolean).join(' ');
  const mapUrl =
    lat && lng
      ? `https://map.kakao.com/link/map/${encodeURIComponent(label || full)},${lat},${lng}`
      : `https://map.kakao.com/?q=${encodeURIComponent(addr)}`;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      {label && <b style={{ fontSize: 13 }}>{label}</b>}
      {zipcode && (
        <span style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>({zipcode})</span>
      )}
      <span>{full}</span>
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          fontSize: 12,
          color: 'var(--ark-color-primary-600)',
          textDecoration: 'none',
        }}
      >
        <MapPin size={12} />
        지도
      </a>
    </span>
  );
}
