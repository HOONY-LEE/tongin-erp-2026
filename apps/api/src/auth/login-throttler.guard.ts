import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** 로그인 시도 제한 — 같은 IP·같은 아이디로 1분에 10번까지 */
export const LOGIN_THROTTLE = { name: 'login', ttl: 60_000, limit: 10 };

export const LOGIN_THROTTLE_MESSAGE = '로그인 시도가 너무 많습니다. 1분 뒤에 다시 시도해 주세요.';

/**
 * 비밀번호 대입을 막는다 — POST /auth/login 에만 붙인다(전역 가드 아님).
 * 기준 = 접속 IP + 입력한 아이디. IP는 req.ip(프록시 헤더를 믿지 않는 값)라 위조할 수 없다.
 * 프록시 뒤에서는 IP가 모두 같게 보일 수 있지만 아이디가 키에 들어가 있어 계정별 제한으로 동작한다.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const body = req.body as { loginId?: unknown } | undefined;
    const loginId = typeof body?.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
    return Promise.resolve(`${String(req.ip ?? '')}|${loginId}`);
  }
}
