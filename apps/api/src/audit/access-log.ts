import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { maskPhonesInText } from '../common/util/mask';

/**
 * 개인정보 접근 기록(접속기록) — 누가 언제 어떤 고객 정보를 열람·내려받았는지.
 * 변경 기록(audit_log CREATE/UPDATE/DELETE)과 같은 표에 action만 달리해 남긴다.
 *  - VIEW: 고객·접수·견적·계약·작업·A/S 같은 한 건 열람
 *  - LIST: 고객이 담긴 목록 열람(몇 건 받았는지)
 *  - EXPORT: 내려받기(표 내보내기·일정 파일·AI 파일) — 무엇을 몇 건, 가렸는지
 */
export type AccessAction = 'VIEW' | 'LIST' | 'EXPORT';
export const ACCESS_ACTIONS: AccessAction[] = ['VIEW', 'LIST', 'EXPORT'];

const ACCESS_LOG_KEY = 'accessLog';

/** 라우트에 붙이면 성공한 응답마다 접근 기록을 남긴다. resource = 화면에서 읽을 대상 이름(예: customer) */
export const AccessLog = (resource: string, action: AccessAction = 'VIEW') =>
  SetMetadata(ACCESS_LOG_KEY, { resource, action });

/** 접근 기록 한 줄 쓰기 — 실패해도 본 요청은 깨지 않는다 */
export async function writeAccessLog(
  prisma: PrismaService,
  row: {
    resource: string;
    action: AccessAction;
    actorUserId?: string | null;
    entityId?: string | null;
    method: string;
    path: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: row.resource,
        entityId: row.entityId ?? null,
        action: row.action,
        actorUserId: row.actorUserId ?? null,
        method: row.method,
        // 검색어로 온 전화번호는 가린다(주소만 봐도 누구를 찾았는지는 남는다: 고객 id·건수)
        path: maskPhonesInText(row.path).slice(0, 500),
        statusCode: 200,
        after: (row.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    // 기록 실패가 화면을 막지 않게
  }
}

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ resource: string; action: AccessAction } | undefined>(
      ACCESS_LOG_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    return next.handle().pipe(
      tap((body) => {
        const count = Array.isArray(body) ? body.length : undefined;
        const id = (req.params as Record<string, string | undefined>)?.id ?? null;
        void writeAccessLog(this.prisma, {
          resource: meta.resource,
          action: meta.action,
          actorUserId: req.user?.userId,
          entityId: id,
          method: req.method,
          path: req.originalUrl,
          detail: count !== undefined ? { count } : undefined,
        });
      }),
    );
  }
}
