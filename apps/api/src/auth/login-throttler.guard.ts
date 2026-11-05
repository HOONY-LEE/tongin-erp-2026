import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** 로그인 시도 제한 — 같은 IP·같은 아이디로 1분에 10번까지 */
export const LOGIN_THROTTLE = { name: 'login', ttl: 60_000, limit: 10 };

/**
 * 아이디 하나에 대한 시도 제한 — IP와 상관없이 15분에 30번까지.
 * IP 기준만으로는 cf-connecting-ip를 바꿔 보내거나(Render 주소로 바로 접속하면 Cloudflare를 안 거친다)
 * IP를 여러 개 쓰면 한 계정에 끝없이 대입할 수 있다. (비밀번호 바꾸기는 본문에 아이디가 없어 로그인한 사용자 기준)
 */
export const LOGIN_ACCOUNT_THROTTLE = {
  name: 'login-account',
  ttl: 15 * 60_000,
  limit: 30,
  getTracker: (req: Record<string, unknown>) => {
    const body = req.body as { loginId?: unknown } | undefined;
    const loginId = typeof body?.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    return loginId ? `id:${loginId}` : `user:${userId ?? String(req.ip ?? '')}`;
  },
};

export const LOGIN_THROTTLE_MESSAGE =
  '로그인 시도가 너무 많습니다. 잠시 뒤(길면 15분) 다시 시도해 주세요.';

/**
 * 비밀번호 대입을 막는다 — POST /auth/login 에만 붙인다(전역 가드 아님).
 * 기준 = 접속 IP + 입력한 아이디.
 * Render 앞단(Cloudflare)을 거치면 req.ip는 요청마다 바뀌는 내부 프록시 주소라 제한이 걸리지 않는다 —
 * Cloudflare가 덮어써 넣는 cf-connecting-ip(클라이언트가 위조할 수 없음)를 먼저 쓰고, 없으면 req.ip.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const body = req.body as { loginId?: unknown } | undefined;
    const loginId = typeof body?.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
    const cf = (req.headers as Record<string, unknown> | undefined)?.['cf-connecting-ip'];
    const ip = typeof cf === 'string' && cf ? cf : String(req.ip ?? '');
    return Promise.resolve(`${ip}|${loginId}`);
  }
}
