import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ApiError } from '../../lib/api';
import { Modal, Spinner } from '../ui';
import styles from './estimate.module.css';

interface Route {
  distanceKm: number;
  durationMin: number | null;
  source: 'KAKAO' | 'STRAIGHT';
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  path: [number, number][];
  fromAddr: string;
  toAddr: string;
}

/** 출발(파랑)·도착(주황) 표시 — 이미지 파일 없이 동그라미 아이콘 */
const pin = (label: string, color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:${color};color:#fff;font:700 12px Pretendard,sans-serif;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

export const formatDuration = (min: number | null) =>
  min == null ? null : min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;

/**
 * 이사 경로 지도 — 출발지와 도착지를 실제 도로 경로(카카오 길찾기)로 잇는다.
 * 지도 바탕은 OpenStreetMap(별도 키 없음). 길찾기를 못 쓰면 두 점을 직선으로 잇고 '추정'으로 표시한다.
 */
export function RouteMapModal({
  estimateId,
  open,
  onClose,
}: {
  estimateId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRoute(null);
    setError(null);
    api<Route>(`/estimates/${estimateId}/route`)
      .then(setRoute)
      .catch((e) => setError(e instanceof ApiError ? e.message : '경로를 불러오지 못했습니다'));
  }, [open, estimateId]);

  useEffect(() => {
    if (!route || !box.current) return;
    const map = L.map(box.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    const line = L.polyline(route.path, {
      color: '#ff7f3b',
      weight: 5,
      opacity: 0.9,
      dashArray: route.source === 'STRAIGHT' ? '8 8' : undefined,
    }).addTo(map);
    L.marker([route.from.lat, route.from.lng], { icon: pin('출', '#2563eb') })
      .bindTooltip(`출발 · ${route.fromAddr}`)
      .addTo(map);
    L.marker([route.to.lat, route.to.lng], { icon: pin('도', '#ff5c00') })
      .bindTooltip(`도착 · ${route.toAddr}`)
      .addTo(map);
    map.fitBounds(line.getBounds(), { padding: [36, 36] });
    // 모달이 열리는 애니메이션 뒤·창 크기가 바뀔 때 크기를 다시 잰다(안 하면 지도 바탕이 비어 보인다)
    const t = setTimeout(() => map.invalidateSize(), 200);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(box.current);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      map.remove();
    };
  }, [route]);

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="이사 경로" size="lg">
      {error ? (
        <div className={styles.routeError}>{error}</div>
      ) : !route ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <div className={styles.routeWrap}>
          <div className={styles.routeSummary}>
            <span className={styles.routeKm}>{route.distanceKm.toLocaleString()} km</span>
            {route.durationMin != null && <span>약 {formatDuration(route.durationMin)}</span>}
            <span className={styles.routeSrc}>
              {route.source === 'KAKAO' ? '카카오 길찾기 도로 기준' : '직선거리 × 1.3 추정'}
            </span>
          </div>
          <div className={styles.routeAddrs}>
            <div>
              <b className={styles.routeFrom}>출발</b> {route.fromAddr}
            </div>
            <div>
              <b className={styles.routeTo}>도착</b> {route.toAddr}
            </div>
          </div>
          <div ref={box} className={styles.routeMap} />
        </div>
      )}
    </Modal>
  );
}
