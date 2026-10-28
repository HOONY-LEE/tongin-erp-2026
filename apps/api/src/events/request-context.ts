import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * 요청 단위 컨텍스트 — 서비스까지 principal을 넘기지 않아도 "누가 했는지"를 알 수 있게.
 * 인증 가드는 미들웨어보다 늦게 req.user를 채우므로, 요청 객체 자체를 담아 두고 쓸 때 읽는다.
 * 예약·이벤트로 돈 에이전트처럼 HTTP 요청 밖에서 일어난 일은 비어 있다.
 */
const requestContext = new AsyncLocalStorage<{ req: Request }>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  requestContext.run({ req }, next);
}

/** 지금 요청한 사용자 id(로그인 전·요청 밖이면 undefined) */
export function currentActorUserId(): string | undefined {
  const req = requestContext.getStore()?.req as { user?: { userId?: string } } | undefined;
  return req?.user?.userId;
}
