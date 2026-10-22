import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * 알림톡/SMS 발송 추상화.
 * - SMS: 솔라피 키(SOLAPI_*)가 있으면 솔라피로, 없고 알리고 키(ALIGO_*)가 있으면 알리고로,
 *   둘 다 없으면 스텁(로그만 남기고 성공 처리).
 * - 알림톡: 템플릿 승인 전이라 아직 스텁.
 *
 * 개발·시연 DB의 고객 번호는 시드로 만든 가짜 번호라 실제 사람일 수 있다.
 * 그래서 SMS_ALLOWED_RECIPIENTS가 있으면(운영 포함) 그 번호로만, 없으면 개발 환경은 전부 막는다.
 * 막힌 건은 보내지 않고 실패(사유 포함)로 돌려준다. 운영에서 실제 고객에게 보내려면 그 값을 비운다.
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

@Injectable()
export class StubNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('Notification');
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
    // 허용 번호가 정해져 있으면(시연 등) 운영에서도 그 번호로만 보낸다.
    // 정해져 있지 않으면 개발 환경은 모두 막고, 운영은 그대로 보낸다.
    const restricted = this.allowed.size > 0 || process.env.NODE_ENV !== 'production';
    if (restricted && !this.allowed.has(digits(recipient))) {
      this.logger.warn(`[SMS] ${recipient} 차단 — SMS_ALLOWED_RECIPIENTS에 없는 번호`);
      return {
        ok: false,
        reason: '허용 번호 아님(SMS_ALLOWED_RECIPIENTS에 있는 번호로만 발송 중)',
      };
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
