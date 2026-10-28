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
    const recipient = await this.resolveRecipient(e);
    // 작업 배정은 받을 사람(현장 직원·전속업체) 연락처가 있을 때만 보낸다
    if (e.eventType === 'work_order.assigned' && !recipient) return;
    const res = await this.provider.send('ALIMTALK', recipient, message);
    await this.prisma.notification.create({
      data: {
        channel: 'ALIMTALK',
        eventType: e.eventType,
        recipient,
        message,
        // 알림톡은 아직 발송사 연결 전(스텁) — 실제로 나가지 않은 건은 SENT가 아니라 SKIPPED로 남긴다
        status: !res.ok ? 'FAILED' : res.delivered ? 'SENT' : 'SKIPPED',
        payload: e.payload as object,
      },
    });
  }

  /**
   * 받는 사람 연락처 — 이벤트 페이로드에는 전화번호를 싣지 않으므로(에이전트 입력으로 넘어감)
   * 배정 대상 id(employeeId·partnerId)로 여기서 찾는다. 예전 형식(recipient)도 그대로 받는다.
   */
  private async resolveRecipient(e: DomainEventBundle): Promise<string | null> {
    if (typeof e.payload.recipient === 'string') return e.payload.recipient;
    if (e.eventType !== 'work_order.assigned') return null;
    if (typeof e.payload.employeeId === 'string') {
      const emp = await this.prisma.employee.findUnique({ where: { id: e.payload.employeeId } });
      return emp?.phone ?? null;
    }
    if (typeof e.payload.partnerId === 'string') {
      const partner = await this.prisma.partner.findUnique({ where: { id: e.payload.partnerId } });
      return partner?.phone ?? null;
    }
    return null;
  }
}
