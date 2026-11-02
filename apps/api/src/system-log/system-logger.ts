import { ConsoleLogger } from '@nestjs/common';
import { logSystem } from './system-log.sink';

/** 예외 필터가 요청 정보(주소·사용자·오류 번호)까지 붙여 직접 남기는 로거 이름 — 여기서는 겹치지 않게 건너뛴다 */
export const HTTP_ERROR_CONTEXT = 'HttpError';

/**
 * 서버 로거 — 콘솔에는 그대로 찍고, 경고·오류는 시스템 로그(DB)에도 남긴다.
 * main.ts에서 app.useLogger로 건다. 서비스들의 new Logger(...).warn/error가 모두 여기로 온다.
 */
export class SystemLogger extends ConsoleLogger {
  override error(message: unknown, ...rest: unknown[]) {
    super.error(message, ...(rest as []));
    this.capture('ERROR', message, rest);
  }

  override warn(message: unknown, ...rest: unknown[]) {
    super.warn(message, ...(rest as []));
    this.capture('WARN', message, rest);
  }

  private capture(level: 'ERROR' | 'WARN', message: unknown, rest: unknown[]) {
    // Nest 규칙: 마지막 문자열 인자가 로거 이름(context), error는 그 앞이 스택
    const strings = rest.filter((x): x is string => typeof x === 'string');
    const context = strings.length ? strings[strings.length - 1] : (this.context ?? null);
    if (context === HTTP_ERROR_CONTEXT || context === 'SystemLog') return;
    const stack = level === 'ERROR' && strings.length > 1 ? strings[0] : null;
    const text =
      message instanceof Error
        ? message.message
        : typeof message === 'string'
          ? message
          : JSON.stringify(message);
    logSystem({
      level,
      source: 'API',
      context,
      message: text || '(내용 없음)',
      detail: message instanceof Error ? (message.stack ?? null) : stack,
    });
  }
}
