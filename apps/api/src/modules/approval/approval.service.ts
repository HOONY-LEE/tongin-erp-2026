import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  APPROVAL_DOC_TYPE_LABEL,
  PERMISSION_WILDCARD,
  type ApprovalDocType,
  type ApprovalLineEntry,
  type ApprovalLineRule,
  type AuthPrincipal,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

/** 결재가 끝났을 때 업무 쪽(휴가·근태)이 반영할 일 — 결재와 같은 트랜잭션 안에서 돈다 */
export interface ApprovalHandler {
  onApproved?(tx: Tx, doc: { id: string; payload: unknown; requesterEmpId: string }): Promise<void>;
  onRejected?(tx: Tx, doc: { id: string; payload: unknown; requesterEmpId: string }): Promise<void>;
  onCanceled?(tx: Tx, doc: { id: string; payload: unknown; requesterEmpId: string }): Promise<void>;
}

/** 화면에 보일 사람 정보 */
export interface PersonView {
  id: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
}

export type ApprovalBox = 'todo' | 'mine' | 'cc' | 'all';

const personSelect = {
  id: true,
  name: true,
  position: { select: { name: true } },
  orgUnit: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;

const toPerson = (e: {
  id: string;
  name: string;
  position: { name: string } | null;
  orgUnit: { name: string } | null;
}): PersonView => ({
  id: e.id,
  name: e.name,
  positionName: e.position?.name ?? null,
  orgUnitName: e.orgUnit?.name ?? null,
});

const docInclude = {
  requester: { select: personSelect },
  steps: { orderBy: { seq: 'asc' }, include: { approver: { select: personSelect } } },
} satisfies Prisma.ApprovalDocInclude;

type DocRow = Prisma.ApprovalDocGetPayload<{ include: typeof docInclude }>;

/**
 * 전자결재 — 기본 결재선 해석, 상신, 승인·반려·회수, 결재함 조회.
 * 휴가·근태 같은 업무는 registerHandler로 문서 종류별 반영 로직을 걸어 둔다.
 */
@Injectable()
export class ApprovalService {
  private readonly handlers = new Map<string, ApprovalHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  registerHandler(docType: ApprovalDocType, handler: ApprovalHandler) {
    this.handlers.set(docType, handler);
  }

  // ── 결재선 해석 ──

  /** 조직 id → { parentId } (작은 표라 통째로 읽는다) */
  private async orgParents(db: Db): Promise<Map<string, string | null>> {
    const rows = await db.orgUnit.findMany({ select: { id: true, parentId: true } });
    return new Map(rows.map((r) => [r.id, r.parentId]));
  }

  /**
   * 조직의 장 — 그 조직 재직자 중 직책이 가장 높은 사람(직책 sortOrder 오름차순, 직책 없으면 뒤로).
   * 그 조직에 (제외 대상 말고) 사람이 없으면 상위 조직으로 올라간다.
   */
  private async headOf(
    db: Db,
    orgUnitId: string,
    exclude: Set<string>,
    parents: Map<string, string | null>,
  ): Promise<string | null> {
    let cur: string | null = orgUnitId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const staff = await db.employee.findMany({
        where: { orgUnitId: cur, isActive: true },
        select: { id: true, name: true, position: { select: { sortOrder: true } } },
      });
      const ranked = staff
        .filter((e) => !exclude.has(e.id))
        .sort(
          (a, b) =>
            (a.position?.sortOrder ?? 9999) - (b.position?.sortOrder ?? 9999) ||
            a.name.localeCompare(b.name),
        );
      if (ranked[0]) return ranked[0].id;
      cur = parents.get(cur) ?? null;
    }
    return null;
  }

  /** 신청자 조직부터 위로 올라가며 가장 가까운 기본 결재선, 없으면 전사 기본 */
  private async findTemplate(
    db: Db,
    docType: ApprovalDocType,
    orgUnitId: string,
    parents: Map<string, string | null>,
  ) {
    const all = await db.approvalLineTemplate.findMany({ where: { docType, isActive: true } });
    let cur: string | null = orgUnitId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const hit = all.find((t) => t.orgUnitId === cur);
      if (hit) return hit;
      cur = parents.get(cur) ?? null;
    }
    return all.find((t) => t.orgUnitId === null) ?? null;
  }

  /** 규칙 → 사람. 결재자는 신청자·앞 단계 결재자와 겹치지 않게 고른다 */
  private async resolveRules(
    db: Db,
    rules: ApprovalLineRule[],
    requester: { id: string; orgUnitId: string },
    parents: Map<string, string | null>,
  ): Promise<ApprovalLineEntry[]> {
    const out: ApprovalLineEntry[] = [];
    const used = new Set<string>([requester.id]);
    for (const r of rules) {
      let empId: string | null = null;
      if (r.resolver === 'EMPLOYEE') empId = r.employeeId ?? null;
      else if (r.resolver === 'DEPT_HEAD')
        empId = await this.headOf(db, requester.orgUnitId, used, parents);
      else if (r.resolver === 'ORG_HEAD' && r.orgUnitId)
        empId = await this.headOf(db, r.orgUnitId, used, parents);
      // 결재 단계는 같은 사람이 두 번 나오지 않게, 참조는 결재자와 겹쳐도 그대로 둔다
      if (!empId) continue;
      if (r.kind === 'APPROVER') {
        if (used.has(empId)) continue;
        used.add(empId);
      } else if (out.some((o) => o.kind === 'CC' && o.employeeId === empId)) continue;
      out.push({ kind: r.kind, employeeId: empId });
    }
    return out;
  }

  /** 신청자의 기본 결재선(사람으로 풀어서) — 신청 화면 미리보기와 상신 기본값 */
  async defaultLine(docType: ApprovalDocType, requesterEmpId: string, db: Db = this.prisma) {
    const requester = await db.employee.findUnique({
      where: { id: requesterEmpId },
      select: { id: true, orgUnitId: true },
    });
    if (!requester) throw new NotFoundException('신청자 직원 정보를 찾을 수 없습니다.');
    const parents = await this.orgParents(db);
    const template = await this.findTemplate(db, docType, requester.orgUnitId, parents);
    // 기본선이 하나도 없으면 부서장 결재 한 단계
    const rules: ApprovalLineRule[] = template
      ? (template.steps as unknown as ApprovalLineRule[])
      : [{ kind: 'APPROVER', resolver: 'DEPT_HEAD' }];
    const entries = await this.resolveRules(db, rules, requester, parents);
    return { templateName: template?.name ?? null, entries };
  }

  /** 미리보기용 — 사람 정보까지 붙여서 */
  async previewLine(docType: ApprovalDocType, principal: AuthPrincipal) {
    const empId = this.requireEmployee(principal);
    const { templateName, entries } = await this.defaultLine(docType, empId);
    const people = await this.people(entries.map((e) => e.employeeId));
    return {
      templateName,
      entries: entries.map((e) => ({ kind: e.kind, person: people.get(e.employeeId)! })),
    };
  }

  private async people(ids: string[], db: Db = this.prisma) {
    const rows = await db.employee.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: personSelect,
    });
    return new Map(rows.map((r) => [r.id, toPerson(r)]));
  }

  // ── 상신 ──

  private requireEmployee(principal: AuthPrincipal): string {
    if (!principal.employeeId)
      throw new ForbiddenException('직원과 연결된 계정만 결재를 쓸 수 있습니다.');
    return principal.employeeId;
  }

  private async nextDocNo(db: Db): Promise<string> {
    const prefix = `AP-${new Date().getFullYear()}-`;
    const last = await db.approvalDoc.findFirst({
      where: { docNo: { startsWith: prefix } },
      orderBy: { docNo: 'desc' },
      select: { docNo: true },
    });
    const n = last ? Number(last.docNo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  /**
   * 상신. 업무 쪽(휴가 등)이 자기 데이터와 한 트랜잭션으로 묶을 수 있게 tx를 받는다.
   * line을 주면 그대로(신청자가 고친 결재선), 없으면 기본 결재선.
   * 결재할 사람이 아무도 없으면(신청자가 최상위 등) 바로 승인으로 끝낸다.
   */
  async submit(
    tx: Tx,
    input: {
      docType: ApprovalDocType;
      title: string;
      content?: string | null;
      payload?: Record<string, unknown> | null;
      requesterEmpId: string;
      line?: ApprovalLineEntry[] | null;
    },
  ) {
    const requester = await tx.employee.findUnique({
      where: { id: input.requesterEmpId },
      select: { id: true, orgUnitId: true, isActive: true },
    });
    if (!requester?.isActive) throw new BadRequestException('재직 중인 직원만 상신할 수 있습니다.');

    let line = input.line ?? null;
    if (line) {
      const ids = [...new Set(line.map((l) => l.employeeId))];
      const found = await tx.employee.count({ where: { id: { in: ids }, isActive: true } });
      if (found !== ids.length)
        throw new BadRequestException('결재선에 재직하지 않는 직원이 있습니다.');
    } else {
      line = (await this.defaultLine(input.docType, requester.id, tx)).entries;
    }

    // 결재 단계: 신청자 본인·중복은 건너뜀. 참조는 순서와 무관하게 뒤에 붙는다
    const seen = new Set<string>();
    const approvers = line
      .filter((l) => l.kind === 'APPROVER')
      .map((l) => {
        const skip = l.employeeId === requester.id || seen.has(l.employeeId);
        seen.add(l.employeeId);
        return { ...l, skip };
      });
    const ccs = line.filter((l) => l.kind === 'CC' && l.employeeId !== requester.id);
    const firstSeq = approvers.findIndex((a) => !a.skip);
    const autoApproved = firstSeq < 0;

    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await tx.approvalDoc.create({
          data: {
            docNo: await this.nextDocNo(tx),
            docType: input.docType,
            title: input.title,
            content: input.content ?? null,
            payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
            requesterEmpId: requester.id,
            orgUnitId: requester.orgUnitId,
            status: autoApproved ? 'APPROVED' : 'PENDING',
            currentSeq: autoApproved ? null : firstSeq + 1,
            completedAt: autoApproved ? new Date() : null,
            steps: {
              create: [
                ...approvers.map((a, i) => ({
                  seq: i + 1,
                  kind: 'APPROVER',
                  approverEmpId: a.employeeId,
                  status: a.skip ? 'SKIPPED' : i === firstSeq ? 'PENDING' : 'WAITING',
                })),
                ...ccs.map((c, i) => ({
                  seq: approvers.length + i + 1,
                  kind: 'CC',
                  approverEmpId: c.employeeId,
                  status: 'WAITING',
                })),
              ],
            },
          },
        });
        if (autoApproved) await this.handlers.get(input.docType)?.onApproved?.(tx, doc);
        return doc;
      } catch (e) {
        // 같은 문서번호를 동시에 받은 경우만 다시 발급
        const clash =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          String(e.meta?.target).includes('doc_no');
        if (!clash || attempt >= 2) throw e;
      }
    }
  }

  /** 일반 품의 상신(화면의 '+ 품의 작성') */
  async submitGeneral(
    principal: AuthPrincipal,
    input: { title: string; content?: string; line?: ApprovalLineEntry[] },
  ) {
    const empId = this.requireEmployee(principal);
    const doc = await this.prisma.$transaction((tx) =>
      this.submit(tx, {
        docType: 'GENERAL',
        title: input.title,
        content: input.content,
        requesterEmpId: empId,
        line: input.line,
      }),
    );
    await this.events.record({
      aggregateType: 'approval_doc',
      aggregateId: doc.id,
      eventType: 'approval.submitted',
      payload: { docType: doc.docType, docNo: doc.docNo, title: doc.title },
    });
    return this.get(doc.id, principal);
  }

  // ── 승인·반려·회수 ──

  async act(id: string, principal: AuthPrincipal, action: 'APPROVE' | 'REJECT', comment?: string) {
    const empId = this.requireEmployee(principal);
    if (action === 'REJECT' && !comment?.trim())
      throw new BadRequestException('반려 사유를 적어 주세요.');

    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.approvalDoc.findUnique({
        where: { id },
        include: { steps: { orderBy: { seq: 'asc' } } },
      });
      if (!doc) throw new NotFoundException('결재 문서를 찾을 수 없습니다.');
      if (doc.status !== 'PENDING') throw new BadRequestException('이미 끝난 문서입니다.');
      const step = doc.steps.find((s) => s.status === 'PENDING' && s.kind === 'APPROVER');
      if (!step || step.approverEmpId !== empId)
        throw new ForbiddenException('지금 결재할 차례가 아닙니다.');

      // 같은 결재를 두 번 누른 경우(더블클릭·동시 요청) — 상태가 바뀌었으면 무시
      const updated = await tx.approvalStep.updateMany({
        where: { id: step.id, status: 'PENDING' },
        data: {
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          comment: comment?.trim() || null,
          actedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new BadRequestException('이미 처리한 결재입니다.');

      const handler = this.handlers.get(doc.docType);
      if (action === 'REJECT') {
        await tx.approvalDoc.update({
          where: { id },
          data: { status: 'REJECTED', currentSeq: null, completedAt: new Date() },
        });
        await handler?.onRejected?.(tx, doc);
        return { doc, outcome: 'rejected' as const };
      }

      const next = doc.steps.find(
        (s) => s.kind === 'APPROVER' && s.seq > step.seq && s.status === 'WAITING',
      );
      if (next) {
        await tx.approvalStep.update({ where: { id: next.id }, data: { status: 'PENDING' } });
        await tx.approvalDoc.update({ where: { id }, data: { currentSeq: next.seq } });
        return { doc, outcome: 'next' as const };
      }
      await tx.approvalDoc.update({
        where: { id },
        data: { status: 'APPROVED', currentSeq: null, completedAt: new Date() },
      });
      await handler?.onApproved?.(tx, doc);
      return { doc, outcome: 'approved' as const };
    });

    if (result.outcome !== 'next') {
      await this.events.record({
        aggregateType: 'approval_doc',
        aggregateId: id,
        eventType: `approval.${result.outcome}`,
        payload: {
          docType: result.doc.docType,
          docNo: result.doc.docNo,
          title: result.doc.title,
          requesterEmpId: result.doc.requesterEmpId,
        },
      });
    }
    return this.get(id, principal);
  }

  /** 신청자 회수 — 아직 아무도 승인하지 않았을 때만 */
  async cancel(id: string, principal: AuthPrincipal) {
    const empId = this.requireEmployee(principal);
    const doc = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.approvalDoc.findUnique({ where: { id }, include: { steps: true } });
      if (!doc) throw new NotFoundException('결재 문서를 찾을 수 없습니다.');
      if (doc.requesterEmpId !== empId)
        throw new ForbiddenException('본인이 올린 문서만 회수할 수 있습니다.');
      if (doc.status !== 'PENDING') throw new BadRequestException('이미 끝난 문서입니다.');
      if (doc.steps.some((s) => s.status === 'APPROVED'))
        throw new BadRequestException(
          '결재가 시작된 문서는 회수할 수 없습니다. 결재자에게 반려를 요청하세요.',
        );
      await tx.approvalDoc.update({
        where: { id },
        data: { status: 'CANCELED', currentSeq: null, completedAt: new Date() },
      });
      await tx.approvalStep.updateMany({
        where: { docId: id, status: 'PENDING' },
        data: { status: 'WAITING' },
      });
      await this.handlers.get(doc.docType)?.onCanceled?.(tx, doc);
      return doc;
    });
    await this.events.record({
      aggregateType: 'approval_doc',
      aggregateId: id,
      eventType: 'approval.canceled',
      payload: { docType: doc.docType, docNo: doc.docNo, title: doc.title },
    });
    return this.get(id, principal);
  }

  // ── 조회 ──

  private canReadAll(p: AuthPrincipal) {
    return p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('APPROVAL.READ');
  }

  private view(doc: DocRow, principal: AuthPrincipal) {
    const me = principal.employeeId;
    const pending = doc.steps.find((s) => s.status === 'PENDING' && s.kind === 'APPROVER');
    return {
      id: doc.id,
      docNo: doc.docNo,
      docType: doc.docType,
      docTypeLabel: APPROVAL_DOC_TYPE_LABEL[doc.docType as ApprovalDocType] ?? doc.docType,
      title: doc.title,
      content: doc.content,
      payload: doc.payload,
      status: doc.status,
      submittedAt: doc.submittedAt,
      completedAt: doc.completedAt,
      requester: toPerson(doc.requester),
      currentApprover: pending ? toPerson(pending.approver) : null,
      steps: doc.steps.map((s) => ({
        seq: s.seq,
        kind: s.kind,
        status: s.status,
        comment: s.comment,
        actedAt: s.actedAt,
        approver: toPerson(s.approver),
      })),
      canAct: !!me && pending?.approverEmpId === me,
      canCancel:
        !!me &&
        doc.requesterEmpId === me &&
        doc.status === 'PENDING' &&
        !doc.steps.some((s) => s.status === 'APPROVED'),
    };
  }

  async get(id: string, principal: AuthPrincipal) {
    const doc = await this.prisma.approvalDoc.findUnique({ where: { id }, include: docInclude });
    if (!doc) throw new NotFoundException('결재 문서를 찾을 수 없습니다.');
    const me = principal.employeeId;
    const involved =
      !!me && (doc.requesterEmpId === me || doc.steps.some((s) => s.approverEmpId === me));
    if (!involved) {
      const ids = this.canReadAll(principal) ? await this.scope.orgScopeIds(principal) : [];
      if (ids !== null && !ids.includes(doc.orgUnitId))
        throw new ForbiddenException('이 결재 문서를 볼 수 없습니다.');
    }
    return this.view(doc, principal);
  }

  /**
   * 결재함
   * - todo: 지금 내 결재 차례
   * - mine: 내가 올린 문서
   * - cc: 내가 참조로 들어간 문서 + 이미 내가 결재한 문서(결재 이력)
   * - all: 범위 안 전체(APPROVAL.READ)
   */
  async list(principal: AuthPrincipal, box: ApprovalBox) {
    const me = principal.employeeId;
    let where: Prisma.ApprovalDocWhereInput;
    if (box === 'all') {
      if (!this.canReadAll(principal))
        throw new ForbiddenException('전체 결재 문서를 볼 권한이 없습니다.');
      const ids = await this.scope.orgScopeIds(principal);
      where = ids === null ? {} : { orgUnitId: { in: ids } };
    } else {
      if (!me) return [];
      if (box === 'todo')
        where = {
          status: 'PENDING',
          steps: { some: { approverEmpId: me, status: 'PENDING', kind: 'APPROVER' } },
        };
      else if (box === 'mine') where = { requesterEmpId: me };
      else
        where = {
          steps: {
            some: {
              approverEmpId: me,
              OR: [{ kind: 'CC' }, { status: { in: ['APPROVED', 'REJECTED'] } }],
            },
          },
        };
    }
    const rows = await this.prisma.approvalDoc.findMany({
      where,
      include: docInclude,
      orderBy: { submittedAt: 'desc' },
      take: 500,
    });
    return rows.map((d) => this.view(d, principal));
  }

  /** 사이드바 배지·대시보드 — 내 결재 차례 건수 */
  async pendingCount(principal: AuthPrincipal) {
    const me = principal.employeeId;
    if (!me) return { count: 0 };
    const count = await this.prisma.approvalStep.count({
      where: { approverEmpId: me, status: 'PENDING', kind: 'APPROVER', doc: { status: 'PENDING' } },
    });
    return { count };
  }

  // ── 기본 결재선(템플릿) ──

  listTemplates() {
    return this.prisma.approvalLineTemplate.findMany({
      orderBy: [{ docType: 'asc' }, { name: 'asc' }],
    });
  }

  private async assertTemplateFree(docType: string, orgUnitId: string | null, exceptId?: string) {
    const dup = await this.prisma.approvalLineTemplate.findFirst({
      where: { docType, orgUnitId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (dup)
      throw new BadRequestException(
        '같은 문서 종류·조직의 결재선이 이미 있습니다. 그것을 고쳐 주세요.',
      );
  }

  private validateSteps(steps: ApprovalLineRule[]) {
    if (!steps.some((s) => s.kind === 'APPROVER'))
      throw new BadRequestException('결재 단계가 하나 이상 있어야 합니다.');
    for (const s of steps) {
      if (s.resolver === 'EMPLOYEE' && !s.employeeId)
        throw new BadRequestException('특정 직원 단계에 직원을 골라 주세요.');
      if (s.resolver === 'ORG_HEAD' && !s.orgUnitId)
        throw new BadRequestException('지정 조직의 장 단계에 조직을 골라 주세요.');
    }
  }

  private cleanSteps(steps: ApprovalLineRule[]) {
    return steps.map((s) => ({
      kind: s.kind,
      resolver: s.resolver,
      orgUnitId: s.resolver === 'ORG_HEAD' ? s.orgUnitId : null,
      employeeId: s.resolver === 'EMPLOYEE' ? s.employeeId : null,
    }));
  }

  async createTemplate(input: {
    docType: ApprovalDocType;
    orgUnitId?: string | null;
    name: string;
    steps: ApprovalLineRule[];
    isActive?: boolean;
  }) {
    this.validateSteps(input.steps);
    await this.assertTemplateFree(input.docType, input.orgUnitId ?? null);
    return this.prisma.approvalLineTemplate.create({
      data: {
        docType: input.docType,
        orgUnitId: input.orgUnitId ?? null,
        name: input.name,
        steps: this.cleanSteps(input.steps) as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateTemplate(
    id: string,
    input: {
      docType: ApprovalDocType;
      orgUnitId?: string | null;
      name: string;
      steps: ApprovalLineRule[];
      isActive?: boolean;
    },
  ) {
    this.validateSteps(input.steps);
    await this.assertTemplateFree(input.docType, input.orgUnitId ?? null, id);
    return this.prisma.approvalLineTemplate.update({
      where: { id },
      data: {
        docType: input.docType,
        orgUnitId: input.orgUnitId ?? null,
        name: input.name,
        steps: this.cleanSteps(input.steps) as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
  }

  async removeTemplate(id: string) {
    await this.prisma.approvalLineTemplate.delete({ where: { id } });
  }
}
