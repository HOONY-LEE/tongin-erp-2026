import { randomBytes } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * 모든 오류 응답을 같은 모양으로 — { statusCode, code, message, ref? }.
 * 화면은 code로 상황을 나눠 안내하고(권한 없음·없는 기능·외부 연동 실패 …), message는 그대로 보여 줄 수 있는 한국어다.
 * 예상하지 못한 오류(500)는 내용을 감추고 오류 번호(ref)만 준다 — 같은 번호로 서버 로그에서 찾는다.
 */
export type ErrorCode =
  | 'VALIDATION' // 400 입력값 문제
  | 'UNAUTHORIZED' // 401 로그인 필요·만료·비밀번호 틀림
  | 'FORBIDDEN' // 403 권한 없음
  | 'NOT_FOUND' // 404 대상 없음
  | 'ROUTE_NOT_FOUND' // 404 서버에 없는 기능(아직 개발 전·서버가 옛 버전)
  | 'CONFLICT' // 409 중복·쓰는 곳이 있어 못 지움·상태가 안 맞음
  | 'TOO_LARGE' // 413
  | 'RATE_LIMIT' // 429
  | 'NOT_IMPLEMENTED' // 501 준비 중인 기능
  | 'UPSTREAM' // 502 외부 연동(AI·결제·문자) 실패
  | 'UNAVAILABLE' // 503 설정 안 됨·DB 연결 안 됨
  | 'INTERNAL'; // 500 예상 못 한 오류

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'TOO_LARGE',
  422: 'VALIDATION',
  429: 'RATE_LIMIT',
  501: 'NOT_IMPLEMENTED',
  502: 'UPSTREAM',
  503: 'UNAVAILABLE',
  504: 'UPSTREAM',
};

/** Nest가 메시지 없이 던질 때 붙는 영어 기본 문장 → 한국어 */
const DEFAULT_MESSAGE: Record<number, string> = {
  400: '입력한 내용을 다시 확인해 주세요.',
  401: '로그인이 필요합니다.',
  403: '이 작업을 할 권한이 없습니다. 필요하면 관리자에게 권한을 요청해 주세요.',
  404: '찾는 대상이 없습니다. 이미 지워졌을 수 있습니다.',
  409: '다른 데이터와 충돌해 처리하지 못했습니다.',
  413: '보낸 내용(파일)이 너무 큽니다.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  501: '아직 준비 중인 기능입니다.',
  502: '외부 서비스 응답에 문제가 있어 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  503: '지금은 이 기능을 쓸 수 없습니다. 잠시 후 다시 시도해 주세요.',
  504: '외부 서비스 응답이 늦어 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

/** Nest·Express 기본 영어 문장인지(사람이 쓴 메시지가 아니면 한국어 기본 문장으로 바꾼다) */
const isDefaultEnglish = (msg: string) =>
  /^(Bad Request|Unauthorized|Forbidden( resource)?|Not Found|Conflict|Payload Too Large|request entity too large|Too Many Requests|Not Implemented|Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error|Unprocessable Entity)$/i.test(
    msg.trim(),
  );

/** Prisma 오류 → 사람이 알아볼 수 있는 응답 */
function fromPrisma(e: Prisma.PrismaClientKnownRequestError): [number, ErrorCode, string] | null {
  switch (e.code) {
    case 'P2002': {
      const target = e.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? '');
      return [
        409,
        'CONFLICT',
        `이미 같은 값이 있습니다${fields ? `(${fields})` : ''}. 다른 값으로 해 주세요.`,
      ];
    }
    case 'P2003':
    case 'P2014':
      return [409, 'CONFLICT', '다른 데이터에서 쓰고 있어 지우거나 바꿀 수 없습니다.'];
    case 'P2023': // 잘못된 형식의 id(주소를 손으로 고친 경우 등)
    case 'P2025':
      return [404, 'NOT_FOUND', '찾는 대상이 없습니다. 이미 지워졌을 수 있습니다.'];
    case 'P2000':
      return [400, 'VALIDATION', '입력한 값이 너무 깁니다.'];
    case 'P1001':
    case 'P1002':
    case 'P1017':
      return [503, 'UNAVAILABLE', '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'];
    default:
      return null;
  }
}

const isBodyParserError = (e: unknown): e is { type: string; status: number } =>
  !!e &&
  typeof e === 'object' &&
  typeof (e as { type?: unknown }).type === 'string' &&
  typeof (e as { status?: unknown }).status === 'number';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (res.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL';
    let message = '';
    let ref: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION');
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      message = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
      // 없는 주소 — 'Cannot GET /api/…' (서버에 아직 없는 기능이거나 서버가 옛 버전)
      if (status === 404 && /^Cannot (GET|POST|PUT|PATCH|DELETE) /.test(message)) {
        code = 'ROUTE_NOT_FOUND';
        message =
          '아직 준비 중인 기능입니다. (서버에 이 기능이 없습니다 — 배포 중이면 잠시 후 다시 시도해 주세요)';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = fromPrisma(exception);
      if (mapped) [status, code, message] = mapped;
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      [status, code, message] = [
        503,
        'UNAVAILABLE',
        '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      ];
    } else if (isBodyParserError(exception)) {
      // body-parser(요청 크기 초과·깨진 JSON) — HttpException이 아니다
      status = exception.status;
      code = CODE_BY_STATUS[status] ?? 'VALIDATION';
      message =
        exception.type === 'entity.parse.failed' ? '보낸 내용을 읽지 못했습니다(형식 오류).' : '';
    }

    // 자주 나오는 영어 기본 문장(깨진 JSON·id 형식) → 한국어
    if (/in JSON at position|Unexpected token|is not valid JSON/i.test(message)) {
      message = '보낸 내용을 읽지 못했습니다(형식 오류).';
    } else if (/^Validation failed \((uuid|numeric string)/i.test(message)) {
      message = '주소의 번호(id) 형식이 올바르지 않습니다. 목록에서 다시 열어 주세요.';
    }
    if (!message || isDefaultEnglish(message)) message = DEFAULT_MESSAGE[status] ?? '';

    if (code === 'INTERNAL') {
      ref = randomBytes(3).toString('hex').toUpperCase();
      message = `서버에서 오류가 났습니다. 같은 문제가 계속되면 오류 번호 ${ref}를 알려 주세요.`;
      this.logger.error(
        `[${ref}] ${req.method} ${req.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status >= 500) {
      this.logger.warn(`${req.method} ${req.originalUrl} → ${status} ${code}: ${message}`);
    }

    res.status(status).json({ statusCode: status, code, message, ...(ref ? { ref } : {}) });
  }
}
