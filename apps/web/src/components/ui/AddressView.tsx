import { MapPin } from 'lucide-react';

interface Props {
  label?: string;
  zipcode?: string | null;
  addr?: string | null;
  addrDetail?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  /** 카카오맵 링크 노출 여부. 기본 true. */
  map?: boolean;
  /** true면 한 줄로 말줄임(...) 처리 — 표(고정 행높이) 안에서 사용할 때 지정. 기본 false(줄바꿈 허용). */
  nowrap?: boolean;
}

/** 구조적 주소(우편번호·도로명·상세) 표시 + 카카오맵 링크(좌표 있으면 핀, 없으면 검색). */
export function AddressView({
  label,
  zipcode,
  addr,
  addrDetail,
  lat,
  lng,
  map = true,
  nowrap = false,
}: Props) {
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

  if (nowrap) {
    return (
      <span
        title={`${full}${zipcode ? `(${zipcode})` : ''}`}
        style={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label && <b style={{ fontSize: 13 }}>{label} </b>}
        {full}
        {zipcode && <span style={{ color: 'var(--ark-color-text-tertiary)' }}>({zipcode})</span>}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      {label && <b style={{ fontSize: 13 }}>{label}</b>}
      <span>
        {full}
        {zipcode && <span style={{ color: 'var(--ark-color-text-tertiary)' }}>({zipcode})</span>}
      </span>
      {map && (
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
      )}
    </span>
  );
}
