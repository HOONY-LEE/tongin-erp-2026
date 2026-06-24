import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

export interface DomainEventBundle {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * 도메인 이벤트를 outbox(domain_event)에 영속화하고, 인프로세스로도 발행한다.
 * - outbox: 영속(향후 에이전트/외부 디스패치 토대, 설계노트 1-A/1-B)
 * - in-process emit: 즉시 핸들러(알림톡 등)가 구독 (@OnEvent)
 */
@Injectable()
export class EventBusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  async record(params: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    const event = await this.prisma.domainEvent.create({
      data: {
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        eventType: params.eventType,
        payload: params.payload as object,
      },
    });
    const bundle: DomainEventBundle = {
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload: params.payload,
    };
    this.emitter.emit(params.eventType, bundle);
    return event;
  }
}
