import { Injectable, Logger } from '@nestjs/common';

/**
 * 알림톡/SMS 발송 추상화.
 * - SMS: 알리고 키(ALIGO_*)가 있으면 실제 발송, 없으면 스텁(로그만 남기고 성공 처리).
 * - 알림톡: 템플릿 승인 전이라 아직 스텁.
 *
 * 개발·시연 DB의 고객 번호는 시드로 만든 가짜 번호라 실제 사람일 수 있다.
 * 그래서 운영(NODE_ENV=production)이 아니면 SMS_ALLOWED_RECIPIENTS에 적힌 번호로만 실제 발송하고,
 * 나머지는 발송하지 않고 실패(사유 포함)로 돌려준다.
 */
export interface SendResult {
  ok: boolean;
  /** 실패·건너뜀 사유 */
  reason?: string;
  /** 실제로 발송사에 보냈는지(false면 스텁·차단) */
  delivered?: boolean;
}

export interface NotificationProvider {
  send(channel: string, recipient: string | null, message: string): Promise<SendResult>;
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
  private readonly allowed = new Set(
    (process.env.SMS_ALLOWED_RECIPIENTS ?? '').split(',').map(digits).filter(Boolean),
  );

  /** SMS를 실제 발송사로 보내는지 — 화면 안내·AI 결과 문구에 쓴다 */
  get smsLive(): boolean {
    return !!(this.aligo.key && this.aligo.userId && this.aligo.sender);
  }

  async send(channel: string, recipient: string | null, message: string): Promise<SendResult> {
    if (channel !== 'SMS' || !this.smsLive) {
      this.logger.log(`[${channel}·스텁] → ${recipient ?? '고객'} : ${message}`);
      return { ok: true, delivered: false };
    }
    if (!recipient) return { ok: false, reason: '수신 번호 없음' };
    if (process.env.NODE_ENV !== 'production' && !this.allowed.has(digits(recipient))) {
      this.logger.warn(
        `[SMS] ${recipient} 차단 — SMS_ALLOWED_RECIPIENTS에 없는 번호(개발·시연 보호)`,
      );
      return {
        ok: false,
        reason: '허용 번호 아님(개발·시연 환경은 SMS_ALLOWED_RECIPIENTS 번호로만 발송)',
      };
    }
    return this.sendAligo(recipient, message);
  }

  /** 알리고 SMS/LMS — 90바이트 넘으면 알리고가 LMS로 자동 전환 */
  private async sendAligo(recipient: string, message: string): Promise<SendResult> {
    const form = new URLSearchParams({
      key: this.aligo.key!,
      user_id: this.aligo.userId!,
      sender: digits(this.aligo.sender!),
      receiver: digits(recipient),
      msg: message,
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
