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
