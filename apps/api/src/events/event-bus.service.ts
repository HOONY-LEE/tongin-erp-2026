import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 도메인 이벤트를 outbox(domain_event)에 영속화한다.
 * 디스패치(핸들러/에이전트 트리거)는 Phase 2(AIX)에서 outbox poller로 추가.
 * 설계노트 1-A(이벤트 기반)·1-B(에이전트 디스패치).
 */
@Injectable()
export class EventBusService {
  constructor(private readonly prisma: PrismaService) {}

  record(params: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.domainEvent.create({
      data: {
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        eventType: params.eventType,
        payload: params.payload as object,
      },
    });
  }
}
