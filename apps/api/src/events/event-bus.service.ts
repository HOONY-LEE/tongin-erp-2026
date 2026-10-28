import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { currentActorUserId } from './request-context';

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
    /** 행위자 — 생략하면 지금 요청의 로그인 사용자(요청 밖이면 비움) */
    actorUserId?: string;
  }) {
    // 누가 일으킨 일인지 페이로드에 함께 남긴다(감사·에이전트 조건용). 값이 없으면 칸을 만들지 않는다.
    const actorUserId = params.actorUserId ?? currentActorUserId();
    const payload =
      actorUserId && params.payload.actorUserId === undefined
        ? { ...params.payload, actorUserId }
        : params.payload;
    const event = await this.prisma.domainEvent.create({
      data: {
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        eventType: params.eventType,
        payload: payload as object,
      },
    });
    const bundle: DomainEventBundle = {
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload,
    };
    this.emitter.emit(params.eventType, bundle);
    return event;
  }
}
