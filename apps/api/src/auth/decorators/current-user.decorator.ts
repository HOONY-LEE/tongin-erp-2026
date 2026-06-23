import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '@tongin/shared';

/** 인증된 주체(JwtStrategy.validate 반환값)를 핸들러 인자로 주입. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthPrincipal }>();
    return request.user;
  },
);
