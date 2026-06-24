import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
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
 * 모든 변경(POST/PATCH/PUT/DELETE) 성공 요청을 audit_log에 기록 (전표 원칙).
 * 인증 경로(/api/auth)는 토큰/비밀번호 노출 방지를 위해 제외.
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
          after: action === 'DELETE' ? undefined : ((body as object) ?? undefined),
        },
      });
    } catch {
      // 감사 기록 실패가 본 요청을 깨뜨리지 않도록 무시
    }
  }
}
