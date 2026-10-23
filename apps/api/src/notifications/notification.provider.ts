import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 알림톡/SMS 발송 추상화.
 * - SMS: 솔라피 키(SOLAPI_*)가 있으면 솔라피로, 없고 알리고 키(ALIGO_*)가 있으면 알리고로,
 *   둘 다 없으면 스텁(로그만 남기고 성공 처리).
 * - 알림톡: 템플릿 승인 전이라 아직 스텁.
 *
 * 개발·시연 DB의 고객 번호는 시드로 만든 가짜 번호라 실제 사람일 수 있다.
 * 그래서 SMS_ALLOWED_RECIPIENTS가 있으면(운영 포함) 허용 번호로만, 없으면 개발 환경은 허용 번호 밖은 막는다.
 * 허용 번호 = SMS_ALLOWED_RECIPIENTS ∪ 시연 번호(공통코드 SMS_DEMO_NUMBERS — 캠페인 화면에서 관리)
 *   ∪ (SMS_ALLOW_EMPLOYEE_PHONES=true일 때만) 재직 직원 번호.
 * 직원 번호는 시드가 만든 가짜 번호일 수 있어 기본은 넣지 않는다 — 실제 번호를 확인한 직원은 시연 번호로 올린다.
 * 막힌 건은 보내지 않고 실패(사유 포함)로 돌려준다. 운영에서 실제 고객에게 보내려면 SMS_ALLOWED_RECIPIENTS를 비운다.
 */
export interface SendResult {
  ok: boolean;
  /** 실패·건너뜀 사유 */
  reason?: string;
  /** 실제로 발송사에 보냈는지(false면 스텁·차단) */
  delivered?: boolean;
}

export interface SendOptions {
  /** 장문(LMS) 제목 */
  title?: string;
}

export interface NotificationProvider {
  send(
    channel: string,
    recipient: string | null,
    message: string,
    opts?: SendOptions,
  ): Promise<SendResult>;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** 시연 번호 공통코드 그룹(code = 숫자만, name = 표시 이름) */
export const SMS_DEMO_NUMBERS_GROUP = 'SMS_DEMO_NUMBERS';
export const SMS_BLOCKED_REASON = '허용 번호 아님(시연 중 — 직원·시연 번호와 허용 번호로만 발송)';
const ALLOWLIST_TTL_MS = 60_000;

/**
 * DB에서 읽는 허용 번호(시연 번호·직원) — 여러 모듈이 provider를 따로 만들어도 캐시는 하나로 같이 쓴다.
 * 시연 번호를 고치면 invalidateSmsAllowlist()로 바로 비운다.
 */
let dbAllowCache: { at: number; set: Set<string> } | null = null;
let dbAllowLoading: Promise<Set<string>> | null = null;
export function invalidateSmsAllowlist() {
  dbAllowCache = null;
  dbAllowLoading = null;
}

/** 이 번호가 (env를 뺀) DB 허용 목록에 있는지 읽는다 — 화면 안내용으로도 쓴다 */
export async function loadDbAllowlist(prisma: PrismaService): Promise<Set<string>> {
  if (dbAllowCache && Date.now() - dbAllowCache.at < ALLOWLIST_TTL_MS) return dbAllowCache.set;
  if (!dbAllowLoading) {
    dbAllowLoading = (async () => {
      const [codes, employees] = await Promise.all([
        prisma.commonCode.findMany({
          where: { codeGroup: SMS_DEMO_NUMBERS_GROUP, isActive: true },
          select: { code: true },
        }),
        process.env.SMS_ALLOW_EMPLOYEE_PHONES === 'true'
          ? prisma.employee.findMany({
              where: { isActive: true, phone: { not: null } },
              select: { phone: true },
            })
          : Promise.resolve([] as { phone: string | null }[]),
      ]);
      const set = new Set(
        [...codes.map((c) => c.code), ...employees.map((e) => e.phone ?? '')]
          .map(digits)
          .filter(Boolean),
      );
      dbAllowCache = { at: Date.now(), set };
      return set;
    })().finally(() => {
      dbAllowLoading = null;
    });
  }
  return dbAllowLoading;
}

@Injectable()
export class StubNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('Notification');

  // PrismaModule은 전역이라 어느 모듈에서 DI로 만들어도 들어온다(직접 new로 만들면 env 허용 번호만 쓴다)
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private readonly aligo = {
    key: process.env.ALIGO_API_KEY,
    userId: process.env.ALIGO_USER_ID,
    sender: process.env.ALIGO_SENDER,
    // Y면 알리고가 과금·실발송 없이 응답만 준다(연동 확인용)
    testmode: process.env.ALIGO_TESTMODE === 'Y',
  };
  private readonly solapi = {
    key: process.env.SOLAPI_API_KEY,
    secret: process.env.SOLAPI_API_SECRET,
    sender: process.env.SOLAPI_SENDER, // 솔라피에 등록한 발신번호
  };
  private readonly allowed = new Set(
    (process.env.SMS_ALLOWED_RECIPIENTS ?? '').split(',').map(digits).filter(Boolean),
  );

  /** SMS를 실제 발송사로 보내는지 — 화면 안내·AI 결과 문구에 쓴다 */
  get smsLive(): boolean {
    return this.solapiLive || this.aligoLive;
  }
  /** 실제로 보내는 문자 발송사 이름(없으면 null = 스텁) */
  get smsVendor(): string | null {
    return this.solapiLive ? '솔라피' : this.aligoLive ? '알리고' : null;
  }
  private get solapiLive() {
    return !!(this.solapi.key && this.solapi.secret && this.solapi.sender);
  }
  private get aligoLive() {
    return !!(this.aligo.key && this.aligo.userId && this.aligo.sender);
  }

  /** 허용 번호로만 보내는 중인지 — 허용 번호(env)가 있거나 운영이 아니면 제한한다 */
  get restricted(): boolean {
    return this.allowed.size > 0 || process.env.NODE_ENV !== 'production';
  }

  /** 화면 안내용 — 지금 문자가 나갈 수 있는 번호(숫자만). 제한이 없으면 null(모두 허용) */
  async allowedNumbers(): Promise<Set<string> | null> {
    if (!this.restricted) return null;
    const db = this.prisma ? await loadDbAllowlist(this.prisma).catch(() => new Set<string>()) : [];
    return new Set([...this.allowed, ...db]);
  }

  /** 이 번호로 실제 문자를 보내도 되는지(제한 중이면 허용 번호만) */
  async isAllowed(recipient: string): Promise<boolean> {
    if (!this.restricted) return true;
    const d = digits(recipient);
    if (!d) return false;
    if (this.allowed.has(d)) return true;
    if (!this.prisma) return false;
    try {
      return (await loadDbAllowlist(this.prisma)).has(d);
    } catch (e) {
      // 목록을 못 읽으면 막는 쪽으로
      this.logger.warn(`[SMS] 허용 번호 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  async send(
    channel: string,
    recipient: string | null,
    message: string,
    opts: SendOptions = {},
  ): Promise<SendResult> {
    if (channel !== 'SMS' || !this.smsLive) {
      this.logger.log(`[${channel}·스텁] → ${recipient ?? '고객'} : ${message}`);
      return { ok: true, delivered: false };
    }
    if (!recipient) return { ok: false, reason: '수신 번호 없음' };
    // 허용 번호가 정해져 있으면(시연 등) 운영에서도 그 번호(+시연 번호)로만 보낸다.
    // 정해져 있지 않으면 개발 환경은 허용 번호 밖은 막고, 운영은 그대로 보낸다.
    if (!(await this.isAllowed(recipient))) {
      this.logger.warn(`[SMS] ${recipient} 차단 — 허용 번호(직원·시연 번호 포함)에 없는 번호`);
      return { ok: false, reason: SMS_BLOCKED_REASON };
    }
    return this.solapiLive
      ? this.sendSolapi(recipient, message, opts.title)
      : this.sendAligo(recipient, message, opts.title);
  }

  /**
   * 솔라피 — HMAC-SHA256(date + salt) 서명 헤더로 v4 send-many/detail 호출.
   * 유형(SMS/LMS)은 길이로 솔라피가 정한다. 장문이면 제목(subject)을 붙인다.
   */
  private async sendSolapi(
    recipient: string,
    message: string,
    title?: string,
  ): Promise<SendResult> {
    const date = new Date().toISOString();
    const salt = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', this.solapi.secret!)
      .update(date + salt)
      .digest('hex');
    try {
      const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `HMAC-SHA256 apiKey=${this.solapi.key}, date=${date}, salt=${salt}, signature=${signature}`,
        },
        body: JSON.stringify({
          messages: [
            {
              to: digits(recipient),
              from: digits(this.solapi.sender!),
              text: message,
              ...(title ? { subject: title } : {}),
            },
          ],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        errorCode?: string;
        errorMessage?: string;
        failedMessageList?: { statusCode?: string; statusMessage?: string }[];
      };
      if (!res.ok) {
        const reason =
          `솔라피 ${res.status} ${body.errorCode ?? ''}: ${body.errorMessage ?? ''}`.trim();
        this.logger.warn(`[SMS·솔라피] 실패 ${reason}`);
        return { ok: false, reason };
      }
      const failed = body.failedMessageList?.[0];
      if (failed) {
        const reason = `솔라피 ${failed.statusCode ?? ''}: ${failed.statusMessage ?? '발송 실패'}`;
        this.logger.warn(`[SMS·솔라피] 실패 ${reason}`);
        return { ok: false, reason };
      }
      this.logger.log(`[SMS·솔라피] → ${recipient}`);
      return { ok: true, delivered: true };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[SMS·솔라피] 연결 실패: ${reason}`);
      return { ok: false, reason: `솔라피 연결 실패: ${reason}` };
    }
  }

  /** 알리고 SMS/LMS — 90바이트 넘으면 알리고가 LMS로 자동 전환 */
  private async sendAligo(recipient: string, message: string, title?: string): Promise<SendResult> {
    const form = new URLSearchParams({
      key: this.aligo.key!,
      user_id: this.aligo.userId!,
      sender: digits(this.aligo.sender!),
      receiver: digits(recipient),
      msg: message,
      ...(title ? { title } : {}),
      ...(this.aligo.testmode ? { testmode_yn: 'Y' } : {}),
    });
    try {
      const res = await fetch('https://apis.aligo.in/send/', { method: 'POST', body: form });
      const body = (await res.json()) as { result_code: number | string; message: string };
      if (Number(body.result_code) > 0) {
        this.logger.log(`[SMS·알리고${this.aligo.testmode ? '·테스트' : ''}] → ${recipient}`);
        return { ok: true, delivered: !this.aligo.testmode };
      }
      this.logger.warn(`[SMS·알리고] 실패 ${body.result_code}: ${body.message}`);
      return { ok: false, reason: `알리고 ${body.result_code}: ${body.message}` };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[SMS·알리고] 연결 실패: ${reason}`);
      return { ok: false, reason: `알리고 연결 실패: ${reason}` };
    }
  }
}
