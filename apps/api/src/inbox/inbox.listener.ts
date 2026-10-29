import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import type { DomainEventBundle } from '../events/event-bus.service';
import { InboxService } from './inbox.service';

const DOC_TYPE_LABEL: Record<string, string> = {
  GENERAL: '품의',
  LEAVE: '휴가',
  ATTENDANCE_FIX: '근태 정정',
};

/** 결재함 화면 — 상자(box)와 문서를 열어 둔 주소 */
const approvalLink = (box: 'todo' | 'mine' | 'cc', id: string) =>
  `/approvals?box=${box}&detail=${id}`;

/**
 * 업무 이벤트 → 내 알림. 결재(요청·진행·승인·반려·회수), 접수 담당 지정, 작업 배정.
 * 팀 업무·댓글 멘션·공지는 해당 서비스가 InboxService를 바로 부른다(이벤트 없이 화면에서만 생기는 일).
 */
@Injectable()
export class InboxListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  @OnEvent('approval.*')
  async onApproval(e: DomainEventBundle) {
    const doc = await this.prisma.approvalDoc.findUnique({
      where: { id: e.aggregateId },
      include: {
        requester: { select: { name: true } },
        steps: { orderBy: { seq: 'asc' } },
      },
    });
    if (!doc) return;
    const actorUserId = typeof e.payload.actorUserId === 'string' ? e.payload.actorUserId : null;
    const kind = DOC_TYPE_LABEL[doc.docType] ?? '결재';
    const pending = doc.steps.find((s) => s.kind === 'APPROVER' && s.status === 'PENDING');
    const ccs = doc.steps.filter((s) => s.kind === 'CC').map((s) => s.approverEmpId);
    const approvers = doc.steps.filter((s) => s.kind === 'APPROVER' && s.status !== 'SKIPPED');
    const done = approvers.filter((s) => s.status === 'APPROVED').length;
    const base = { entityType: 'approval_doc', entityId: doc.id, actorUserId };

    switch (e.eventType) {
      case 'approval.submitted':
      case 'approval.next':
        if (pending) {
          await this.inbox.toEmployees([pending.approverEmpId], {
            ...base,
            kind: 'APPROVAL_REQUEST',
            title: `결재 요청 · ${doc.title}`,
            body: `${doc.requester.name}님의 ${kind} 문서(${doc.docNo})를 결재할 차례입니다.`,
            link: approvalLink('todo', doc.id),
          });
        }
        if (e.eventType === 'approval.submitted' && ccs.length) {
          await this.inbox.toEmployees(ccs, {
            ...base,
            kind: 'APPROVAL_CC',
            title: `참조 · ${doc.title}`,
            body: `${doc.requester.name}님이 ${kind} 문서(${doc.docNo})에 참조로 넣었습니다.`,
            link: approvalLink('cc', doc.id),
          });
        }
        if (e.eventType === 'approval.next') {
          await this.inbox.toEmployees([doc.requesterEmpId], {
            ...base,
            kind: 'APPROVAL_RESULT',
            title: `결재 진행 · ${doc.title}`,
            body: `${done}/${approvers.length}단계 승인 — 다음 결재자에게 넘어갔습니다.`,
            link: approvalLink('mine', doc.id),
          });
        }
        return;
      case 'approval.approved':
        await this.inbox.toEmployees([doc.requesterEmpId], {
          ...base,
          kind: 'APPROVAL_RESULT',
          title: `승인 완료 · ${doc.title}`,
          body: `${kind} 문서(${doc.docNo})가 최종 승인되었습니다.`,
          link: approvalLink('mine', doc.id),
        });
        if (ccs.length) {
          await this.inbox.toEmployees(ccs, {
            ...base,
            kind: 'APPROVAL_CC',
            title: `결재 완료(참조) · ${doc.title}`,
            body: `참조로 받은 ${kind} 문서(${doc.docNo})가 승인되었습니다.`,
            link: approvalLink('cc', doc.id),
          });
        }
        return;
      case 'approval.rejected': {
        const rejected = doc.steps.find((s) => s.status === 'REJECTED');
        await this.inbox.toEmployees([doc.requesterEmpId], {
          ...base,
          kind: 'APPROVAL_RESULT',
          title: `반려 · ${doc.title}`,
          body: rejected?.comment
            ? `반려 사유: ${rejected.comment}`
            : `${kind} 문서(${doc.docNo})가 반려되었습니다.`,
          link: approvalLink('mine', doc.id),
        });
        return;
      }
      case 'approval.canceled': {
        // 회수 전 결재 차례였던 사람에게 — 회수하면 PENDING이 사라지므로 처리 안 된 결재자 전부
        const waiting = doc.steps
          .filter((s) => s.kind === 'APPROVER' && s.status !== 'APPROVED' && s.status !== 'SKIPPED')
          .slice(0, 1)
          .map((s) => s.approverEmpId);
        await this.inbox.toEmployees(waiting, {
          ...base,
          kind: 'APPROVAL_RESULT',
          title: `회수됨 · ${doc.title}`,
          body: `${doc.requester.name}님이 결재 요청을 회수했습니다.`,
          link: approvalLink('cc', doc.id),
        });
        return;
      }
    }
  }

  @OnEvent('lead.assigned')
  async onLeadAssigned(e: DomainEventBundle) {
    const owner = typeof e.payload.ownerEmpId === 'string' ? e.payload.ownerEmpId : null;
    if (!owner) return;
    const lead = await this.prisma.lead.findUnique({
      where: { id: e.aggregateId },
      select: { leadNo: true, customer: { select: { name: true } } },
    });
    if (!lead) return;
    await this.inbox.toEmployees([owner], {
      kind: 'LEAD_ASSIGNED',
      title: `접수 담당 지정 · ${lead.leadNo}`,
      body: `${lead.customer?.name ?? '고객'} 접수의 담당자로 지정되었습니다.`,
      link: `/leads/${e.aggregateId}`,
      entityType: 'lead',
      entityId: e.aggregateId,
      actorUserId: typeof e.payload.actorUserId === 'string' ? e.payload.actorUserId : null,
    });
  }

  @OnEvent('work_order.assigned')
  async onWorkAssigned(e: DomainEventBundle) {
    const emp = typeof e.payload.employeeId === 'string' ? e.payload.employeeId : null;
    if (!emp) return;
    const date =
      typeof e.payload.scheduledDate === 'string' ? ` · 작업일 ${e.payload.scheduledDate}` : '';
    await this.inbox.toEmployees([emp], {
      kind: 'WORK_ASSIGNED',
      title: `작업 배정 · ${String(e.payload.workNo ?? '')}`,
      body: `작업에 배정되었습니다${date}.`,
      link: `/work-orders/${e.aggregateId}`,
      entityType: 'work_order',
      entityId: e.aggregateId,
      actorUserId: typeof e.payload.actorUserId === 'string' ? e.payload.actorUserId : null,
    });
  }
}
