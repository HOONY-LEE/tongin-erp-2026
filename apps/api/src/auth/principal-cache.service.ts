import { Global, Injectable, Module } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';

/** 주체(권한·스코프) 캐시 유지 시간 — 바뀐 권한이 늦어도 이 시간 안에는 반영된다 */
export const PRINCIPAL_TTL_MS = 60_000;

/**
 * 요청마다 다시 읽던 AuthPrincipal(계정→직원→직책·역할→권한)을 userId별로 잠깐 들고 있는다.
 * DB가 멀어(왕복 ~200ms) 인증만으로 요청마다 쿼리 여러 번이 들던 비용을 없앤다.
 * 컨테이너가 하나라 메모리 캐시로 충분하다.
 *
 * 비우는 때: 역할·권한·직책·계정(활성·역할·연결 직원)·직원 정보가 바뀌면 바로 비운다.
 * 데모 시드처럼 다른 프로세스가 DB를 바꾼 경우는 TTL(60초) 안에 반영된다.
 */
@Injectable()
export class PrincipalCache {
  // 같은 사용자의 동시 요청(화면 하나가 4~6개)이 한 번만 읽도록 Promise를 담는다
  private readonly entries = new Map<
    string,
    { at: number; value: Promise<AuthPrincipal | null> }
  >();

  get(userId: string, load: () => Promise<AuthPrincipal | null>): Promise<AuthPrincipal | null> {
    const now = Date.now();
    const hit = this.entries.get(userId);
    if (hit && now - hit.at < PRINCIPAL_TTL_MS) return hit.value;

    const value = load();
    const entry = { at: now, value };
    this.entries.set(userId, entry);
    // 실패한 조회는 담아 두지 않는다(다음 요청이 다시 읽게)
    value.catch(() => {
      if (this.entries.get(userId) === entry) this.entries.delete(userId);
    });
    return value;
  }

  invalidateUser(userId: string): void {
    this.entries.delete(userId);
  }

  invalidateAll(): void {
    this.entries.clear();
  }
}

/** 권한을 바꾸는 서비스(권한관리·계정·직원)가 어디서든 비울 수 있게 전역으로 둔다 */
@Global()
@Module({
  providers: [PrincipalCache],
  exports: [PrincipalCache],
})
export class PrincipalCacheModule {}
