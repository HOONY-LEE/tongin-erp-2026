import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { StubNotificationProvider } from './notification.provider';
import type { DomainEventBundle } from '../events/event-bus.service';

// 현장 화면 링크 — 알림톡을 앱 푸시 대신 쓰므로, 눌러서 바로 작업지시서로 들어가게 한다
const WEB_APP_URL = process.env.WEB_APP_URL ?? 'http://localhost:3002';

/** 도메인 이벤트 → 단계별 알림톡 메시지 템플릿 (매핑된 이벤트만 발송). */
const TEMPLATES: Record<string, (e: DomainEventBundle) => string> = {
  'lead.created': (e) => `[통인익스프레스] 접수가 완료되었습니다. (${e.payload.leadNo ?? ''})`,
  'estimate.quoted': (e) =>
    `[통인익스프레스] 견적이 확정되었습니다. 총 물량 ${e.payload.totalCbm ?? '-'}CBM`,
  'contract.signed': (e) =>
    `[통인익스프레스] 계약이 체결되었습니다. (${e.payload.contractNo ?? ''})`,
  'payment.confirmed': (e) =>
    `[통인익스프레스] ${e.payload.kind === 'DEPOSIT' ? '계약금' : '잔금'} 입금이 확인되었습니다.`,
  'work_order.completed': (e) =>
    `[통인익스프레스] 작업이 완료되었습니다. 이용해 주셔서 감사합니다.`,
  // 현장 직원·전속업체 대상 — 앱 설치 없이 링크로 작업지시서 진입
  'work_order.assigned': (e) =>
    `[통인익스프레스] 작업이 배정되었습니다.\n작업번호 ${e.payload.workNo ?? ''}` +
    `${e.payload.scheduledDate ? `\n작업일 ${e.payload.scheduledDate}` : ''}` +
    `\n${WEB_APP_URL}/field/work-orders/${e.payload.workOrderId ?? ''}`,
};

@Injectable()
export class NotificationListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: StubNotificationProvider,
  ) {}

  /** 모든 도메인 이벤트 구독(와일드카드) → 매핑된 것만 알림톡 발송·기록. */
  @OnEvent('**')
  async onDomainEvent(e: DomainEventBundle) {
    const tpl = TEMPLATES[e.eventType];
    if (!tpl) return;
    const message = tpl(e);
    const recipient = (e.payload.recipient as string) ?? null;
    const res = await this.provider.send('ALIMTALK', recipient, message);
    await this.prisma.notification.create({
      data: {
        channel: 'ALIMTALK',
        eventType: e.eventType,
        recipient,
        message,
        status: res.ok ? 'SENT' : 'FAILED',
        payload: e.payload as object,
      },
    });
  }
}
