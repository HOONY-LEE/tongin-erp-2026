import { Injectable, Logger } from '@nestjs/common';

/**
 * 알림톡/SMS 발송 추상화. 운영은 솔라피·알리고 등 어댑터로 교체.
 * 지금은 스텁 — 실제 전송 대신 로그만 남기고 성공 처리.
 */
export interface NotificationProvider {
  send(channel: string, recipient: string | null, message: string): Promise<{ ok: boolean }>;
}

@Injectable()
export class StubNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('Notification');

  async send(channel: string, recipient: string | null, message: string) {
    this.logger.log(`[${channel}] → ${recipient ?? '고객'} : ${message}`);
    return { ok: true };
  }
}
