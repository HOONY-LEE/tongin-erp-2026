import { Injectable, Logger } from '@nestjs/common';

export interface GeocodeResult {
  available: boolean; // 카카오 키 설정 여부(false면 좌표 미수집)
  lat: number | null;
  lng: number | null;
  sido: string | null;
  sigungu: string | null;
}

/**
 * 도로명주소 → 좌표/행정구역 변환 (카카오 Local REST).
 * KAKAO_REST_API_KEY 미설정 시 available:false로 우아하게 동작(우편번호·주소만 저장).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger('Geo');
  private get key(): string | undefined {
    return process.env.KAKAO_REST_API_KEY;
  }

  /**
   * 출발지 → 도착지 거리. 카카오모빌리티 길찾기(실제 도로 거리·소요시간·경로)를 쓰고,
   * 키가 없거나 실패하면 직선거리×1.3(도로 굴곡 보정)으로 추정한다. 좌표가 없으면 주소로 찾는다.
   * 좌표를 끝내 못 찾으면 null.
   */
  async route(from: RoutePoint, to: RoutePoint): Promise<RouteResult | null> {
    const [a, b] = await Promise.all([this.point(from), this.point(to)]);
    if (!a || !b) return null;
    if (this.key) {
      try {
        const url =
          `https://apis-navi.kakaomobility.com/v1/directions?origin=${a.lng},${a.lat}` +
          `&destination=${b.lng},${b.lat}&priority=RECOMMEND`;
        const res = await fetch(url, { headers: { Authorization: `KakaoAK ${this.key}` } });
        if (res.ok) {
          const json = (await res.json()) as KakaoRoutes;
          const r = json.routes?.[0];
          if (r && r.result_code === 0 && r.summary) {
            const path: [number, number][] = [];
            for (const sec of r.sections ?? []) {
              for (const road of sec.roads ?? []) {
                const v = road.vertexes ?? [];
                for (let i = 0; i + 1 < v.length; i += 2) path.push([v[i + 1], v[i]]);
              }
            }
            return {
              distanceKm: Math.round(r.summary.distance / 100) / 10,
              durationMin: Math.round(r.summary.duration / 60),
              source: 'KAKAO',
              from: a,
              to: b,
              path: path.length
                ? thin(path)
                : [
                    [a.lat, a.lng],
                    [b.lat, b.lng],
                  ],
            };
          }
          this.logger.warn(`카카오 길찾기 결과 없음: ${r?.result_msg ?? '-'}`);
        } else {
          this.logger.warn(`카카오 길찾기 실패 ${res.status}`);
        }
      } catch (e) {
        this.logger.warn(`카카오 길찾기 예외: ${(e as Error).message}`);
      }
    }
    return {
      distanceKm: Math.round(haversineKm(a, b) * 1.3 * 10) / 10,
      durationMin: null,
      source: 'STRAIGHT',
      from: a,
      to: b,
      path: [
        [a.lat, a.lng],
        [b.lat, b.lng],
      ],
    };
  }

  private async point(p: RoutePoint): Promise<{ lat: number; lng: number } | null> {
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
    if (!p.addr) return null;
    return this.locate(p.addr);
  }

  /**
   * 주소 → 좌표(거리 계산용, 느슨하게). 정확한 주소 → 장소 검색 → 시·군·구 중심 순으로 찾는다.
   * 번지가 틀린 주소도 같은 동네 안이면 이사 거리 계산에는 충분하다.
   */
  private async locate(addr: string): Promise<{ lat: number; lng: number } | null> {
    const exact = await this.geocode(addr);
    if (exact.lat != null && exact.lng != null) return { lat: exact.lat, lng: exact.lng };
    if (!this.key) return null;
    const keyword = await this.keyword(addr);
    if (keyword) return keyword;
    // '경기 성남시 분당구 …' → '경기 성남시 분당구', '서울 강남구 …' → '서울 강남구'
    const parts = addr.trim().split(/\s+/);
    const n = parts[2]?.endsWith('구') && parts[1]?.endsWith('시') ? 3 : 2;
    const district = parts.slice(0, n).join(' ');
    if (!district || district === addr.trim()) return null;
    const area = await this.geocode(district);
    return area.lat != null && area.lng != null ? { lat: area.lat, lng: area.lng } : null;
  }

  private async keyword(query: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
        { headers: { Authorization: `KakaoAK ${this.key}` } },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { documents?: { x?: string; y?: string }[] };
      const d = json.documents?.[0];
      return d?.x && d?.y ? { lat: Number(d.y), lng: Number(d.x) } : null;
    } catch {
      return null;
    }
  }

  async geocode(query: string): Promise<GeocodeResult> {
    const empty: GeocodeResult = {
      available: false,
      lat: null,
      lng: null,
      sido: null,
      sigungu: null,
    };
    if (!this.key) return empty;
    if (!query?.trim()) return { ...empty, available: true };
    try {
      const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Authorization: `KakaoAK ${this.key}` } });
      if (!res.ok) {
        this.logger.warn(`카카오 지오코딩 실패 ${res.status}`);
        return { ...empty, available: true };
      }
      const json = (await res.json()) as { documents?: KakaoDoc[] };
      const doc = json.documents?.[0];
      if (!doc) return { ...empty, available: true };
      const addr = doc.road_address ?? doc.address;
      return {
        available: true,
        lat: doc.y ? Number(doc.y) : null,
        lng: doc.x ? Number(doc.x) : null,
        sido: addr?.region_1depth_name ?? null,
        sigungu: addr?.region_2depth_name ?? null,
      };
    } catch (e) {
      this.logger.warn(`카카오 지오코딩 예외: ${(e as Error).message}`);
      return { ...empty, available: true };
    }
  }
}

export interface RoutePoint {
  lat?: number | null;
  lng?: number | null;
  /** 좌표가 없으면 주소로 좌표를 찾는다 */
  addr?: string | null;
}
export interface RouteResult {
  /** 도로 거리(km, 소수 1자리) */
  distanceKm: number;
  /** 예상 소요(분) — 직선 추정이면 null */
  durationMin: number | null;
  /** KAKAO = 카카오모빌리티 길찾기(실제 도로) | STRAIGHT = 직선거리×1.3 추정 */
  source: 'KAKAO' | 'STRAIGHT';
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** 지도에 그릴 경로 [[lat, lng] …] — 길찾기면 도로를 따라, 추정이면 두 점 */
  path: [number, number][];
}

/** 직선거리(km) — 하버사인 */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 경로 점이 너무 많으면 고르게 솎아 낸다(지도 표시·응답 크기용) */
function thin(path: [number, number][], max = 400): [number, number][] {
  if (path.length <= max) return path;
  const step = path.length / max;
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(path[Math.floor(i * step)]);
  out.push(path[path.length - 1]);
  return out;
}

interface KakaoRegion {
  region_1depth_name?: string;
  region_2depth_name?: string;
}
interface KakaoDoc {
  x?: string;
  y?: string;
  road_address?: KakaoRegion | null;
  address?: KakaoRegion | null;
}

interface KakaoRoutes {
  routes?: {
    result_code: number;
    result_msg?: string;
    summary?: { distance: number; duration: number };
    sections?: { roads?: { vertexes?: number[] }[] }[];
  }[];
}
