import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';

const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'CREATE',
  PATCH: 'UPDATE',
  PUT: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * 감사 기록(after)에 남기지 않는 값 — 응답 본문을 그대로 담으면 고객 전화·주소, 서명 링크·토큰,
 * 가상계좌, 문자 내용까지 쌓여 감사 기록 화면이 개인정보 창구가 된다. 키 이름으로 가린다.
 */
const SECRET_KEY =
  /(phone|mobile|tel$|addr|address|birth|rrn|ssn|emergency|token|secret|password|signature|account|link$|^to$|recipient|message|bank)/i;
const MAX_DEPTH = 6;
const MAX_ITEMS = 50;

export function redactForAudit(v: unknown, depth = 0): unknown {
  if (v === null || typeof v !== 'object') return v;
  // Date·Prisma Decimal 등은 JSON으로 저장될 모양(문자열)으로 먼저 바꾼다
  const toJSON = (v as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') return redactForAudit(toJSON.call(v), depth);
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(v)) {
    const out = v.slice(0, MAX_ITEMS).map((x) => redactForAudit(x, depth + 1));
    if (v.length > MAX_ITEMS) out.push(`[…${v.length - MAX_ITEMS}건 더]`);
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out[k] =
      SECRET_KEY.test(k) && x !== null && x !== undefined ? '[가림]' : redactForAudit(x, depth + 1);
  }
  return out;
}

/**
 * 모든 변경(POST/PATCH/PUT/DELETE) 성공 요청을 audit_log에 기록 (전표 원칙).
 * 인증 경로(/api/auth)는 토큰/비밀번호 노출 방지를 위해 제외. 본문은 redactForAudit으로 개인정보·비밀값을 가린다.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const action = ACTION_BY_METHOD[req.method];
    if (!action || req.path.startsWith('/api/auth')) return next.handle();

    return next.handle().pipe(
      tap((body) => {
        const res = context.switchToHttp().getResponse<Response>();
        void this.write(req, res.statusCode, action, body);
      }),
    );
  }

  private async write(
    req: Request & { user?: AuthPrincipal },
    statusCode: number,
    action: string,
    body: unknown,
  ): Promise<void> {
    try {
      const parts = req.path.split('/').filter(Boolean); // ['api','org-units', id?]
      const entityType = parts[1] ?? 'unknown';
      const bodyId =
        body && typeof body === 'object' && 'id' in body
          ? String((body as { id: unknown }).id)
          : undefined;
      await this.prisma.auditLog.create({
        data: {
          entityType,
          entityId: bodyId ?? parts[2],
          action,
          actorUserId: req.user?.userId,
          method: req.method,
          path: req.path,
          statusCode,
          after:
            action === 'DELETE' || body == null
              ? undefined
              : (redactForAudit(body) as Prisma.InputJsonValue),
        },
      });
    } catch {
      // 감사 기록 실패가 본 요청을 깨뜨리지 않도록 무시
    }
  }
}
