/**
 * 시스템 로그 모으기 — 어디서든(예외 필터·로거·프로세스 오류) 부를 수 있게 모듈 함수로 둔다.
 * 바로 DB에 쓰지 않고 모아 두었다가 SystemLogService가 몇 초마다 한 번에 넣는다.
 *
 * 용량을 지키는 장치:
 *  - 경고·오류만 남긴다(정보성 로그는 서버 콘솔에만)
 *  - 글자 수를 자른다(메시지 1,000자·자세한 내용 4,000자)
 *  - 1분에 최대 MAX_PER_MINUTE줄 — 넘치면 버리고 'N줄 생략'을 한 줄 남긴다(오류 폭주 때 DB가 차지 않게)
 *  - 같은 메시지가 1분 안에 되풀이되면 처음 몇 번만 남긴다
 *  - 보관: 30일 또는 최대 2만 줄(SystemLogService.prune)
 */
export interface SystemLogEntry {
  level: 'ERROR' | 'WARN';
  source: 'API' | 'WEB';
  context?: string | null;
  message: string;
  detail?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  userId?: string | null;
  ref?: string | null;
}

const MESSAGE_MAX = 1000;
const DETAIL_MAX = 4000;
const MAX_PER_MINUTE = 120;
const SAME_PER_MINUTE = 5;
/** DB가 늦을 때 메모리에 들고 있는 최대 줄 수 */
const BUFFER_MAX = 1000;

const buffer: (SystemLogEntry & { createdAt: Date })[] = [];
let windowStart = 0;
let windowCount = 0;
let dropped = 0;
const sameCount = new Map<string, number>();

export function logSystem(e: SystemLogEntry) {
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    if (dropped)
      buffer.push({
        level: 'WARN',
        source: 'API',
        context: 'SystemLog',
        message: `로그가 너무 많아 1분 동안 ${dropped}줄을 남기지 않았습니다(같은 오류 되풀이·폭주)`,
        createdAt: new Date(windowStart + 60_000),
      });
    windowStart = now;
    windowCount = 0;
    dropped = 0;
    sameCount.clear();
  }
  const key = `${e.level}|${e.source}|${e.context ?? ''}|${e.message.slice(0, 200)}`;
  const same = (sameCount.get(key) ?? 0) + 1;
  sameCount.set(key, same);
  if (windowCount >= MAX_PER_MINUTE || same > SAME_PER_MINUTE || buffer.length >= BUFFER_MAX) {
    dropped++;
    return;
  }
  windowCount++;
  buffer.push({
    ...e,
    message: e.message.slice(0, MESSAGE_MAX),
    detail: e.detail ? e.detail.slice(0, DETAIL_MAX) : null,
    path: e.path ? e.path.slice(0, 500) : null,
    context: e.context ? e.context.slice(0, 100) : null,
    createdAt: new Date(now),
  });
}

/** 모아 둔 줄을 꺼낸다(SystemLogService가 DB에 넣는다) */
export function drainSystemLogs() {
  return buffer.splice(0, buffer.length);
}

/** 넣다 실패한 줄을 다시 앞에 — 다음 번에 다시 넣는다(메모리 한도 안에서) */
export function requeueSystemLogs(rows: (SystemLogEntry & { createdAt: Date })[]) {
  buffer.unshift(...rows.slice(0, Math.max(0, BUFFER_MAX - buffer.length)));
}
