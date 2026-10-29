import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LEAVE_SLOT_LABEL,
  PERMISSION_WILDCARD,
  countWorkdays,
  isWorkday,
  leaveEntitlement,
  leaveSlotsFor,
  type ApprovalLineEntry,
  type AuthPrincipal,
  type LeaveFormSettings,
  type LeaveSlot,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { ApprovalService } from '../approval/approval.service';
import { ApprovalFormService } from '../approval/approval-form.service';

const ymd = (d: Date | string) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
const todayYmd = () => {
  // 한국 날짜 기준 오늘(서버가 UTC여도)
  const now = new Date(Date.now() + 9 * 3600_000);
  return now.toISOString().slice(0, 10);
};
const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

export interface LeaveBalance {
  employeeId: string;
  hireDate: string | null;
  periodStart: string;
  periodEnd: string;
  /** 입사일 기준 발생(입사일이 없으면 0) */
  granted: number;
  /** 조정 합(±) */
  adjusted: number;
  /** 승인된 차감 휴가 */
  used: number;
  /** 결재 중인 차감 휴가 */
  pending: number;
  /** 남은 연차(결재 중은 빼지 않은 값) */
  remaining: number;
  firstYear: boolean;
  years: number;
}

@Injectable()
export class LeaveService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly approvals: ApprovalService,
    private readonly forms: ApprovalFormService,
  ) {}

  /** 결재가 끝나면 휴가 신청 상태를 같은 트랜잭션에서 맞춘다 */
  onModuleInit() {
    const setStatus =
      (status: string) => async (tx: Prisma.TransactionClient, doc: { payload: unknown }) => {
        const id = (doc.payload as { leaveRequestId?: string } | null)?.leaveRequestId;
        if (id) await tx.leaveRequest.updateMany({ where: { id }, data: { status } });
      };
    this.approvals.registerHandler('LEAVE', {
      onApproved: setStatus('APPROVED'),
      onRejected: setStatus('REJECTED'),
      onCanceled: setStatus('CANCELED'),
    });
  }

  // ── 휴가 종류 ──

  types(all = false) {
    return this.prisma.leaveType.findMany({
      where: all ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createType(input: {
    code: string;
    name: string;
    unitDays: number;
    deducts: boolean;
    paid: boolean;
    sortOrder?: number;
  }) {
    return this.prisma.leaveType.create({ data: input });
  }

  updateType(
    id: string,
    input: Partial<{
      name: string;
      unitDays: number;
      deducts: boolean;
      paid: boolean;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.leaveType.update({ where: { id }, data: input });
  }

  // ── 잔여 연차 ──

  /** 직원 여럿의 잔여 연차를 한 번에(목록 화면) */
  private async balances(
    employeeIds: string[],
    asOf = todayYmd(),
  ): Promise<Map<string, LeaveBalance>> {
    if (employeeIds.length === 0) return new Map();
    const [emps, requests, adjustments] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, hireDate: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: { in: ['APPROVED', 'PENDING'] },
          leaveType: { deducts: true },
        },
        select: { employeeId: true, startDate: true, days: true, status: true },
      }),
      this.prisma.leaveAdjustment.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { employeeId: true, effectiveDate: true, days: true },
      }),
    ]);
    const out = new Map<string, LeaveBalance>();
    for (const e of emps) {
      const hire = e.hireDate ? ymd(e.hireDate) : null;
      // 입사일이 없으면 올해(1/1~12/31)를 기간으로 보고 조정분만 센다
      const ent = hire ? leaveEntitlement(hire, asOf) : null;
      const periodStart = ent?.periodStart ?? `${asOf.slice(0, 4)}-01-01`;
      const periodEnd = ent?.periodEnd ?? `${asOf.slice(0, 4)}-12-31`;
      const inPeriod = (d: Date) => {
        const s = ymd(d);
        return s >= periodStart && s <= periodEnd;
      };
      let used = 0;
      let pending = 0;
      for (const r of requests) {
        if (r.employeeId !== e.id || !inPeriod(r.startDate)) continue;
        if (r.status === 'APPROVED') used += Number(r.days);
        else pending += Number(r.days);
      }
      const adjusted = adjustments
        .filter((a) => a.employeeId === e.id && inPeriod(a.effectiveDate))
        .reduce((s, a) => s + Number(a.days), 0);
      const granted = ent?.days ?? 0;
      out.set(e.id, {
        employeeId: e.id,
        hireDate: hire,
        periodStart,
        periodEnd,
        granted,
        adjusted,
        used,
        pending,
        remaining: granted + adjusted - used,
        firstYear: ent?.firstYear ?? false,
        years: ent?.years ?? 0,
      });
    }
    return out;
  }

  async balance(employeeId: string): Promise<LeaveBalance> {
    const b = (await this.balances([employeeId])).get(employeeId);
    if (!b) throw new NotFoundException('직원을 찾을 수 없습니다.');
    return b;
  }

  // ── 조회 ──

  private requireEmployee(p: AuthPrincipal) {
    if (!p.employeeId) throw new ForbiddenException('직원과 연결된 계정만 휴가를 쓸 수 있습니다.');
    return p.employeeId;
  }

  private canManage(p: AuthPrincipal, action: 'READ' | 'UPDATE') {
    return p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes(`LEAVE.${action}`);
  }

  /** 다른 직원 것을 볼 수 있는지 — 본인이거나 LEAVE.READ + 데이터 범위 */
  private async assertCanSee(
    p: AuthPrincipal,
    employeeId: string,
    action: 'READ' | 'UPDATE' = 'READ',
  ) {
    if (action === 'READ' && p.employeeId === employeeId) return;
    if (!this.canManage(p, action))
      throw new ForbiddenException('이 직원의 휴가를 볼 권한이 없습니다.');
    const ids = await this.scope.orgScopeIds(p);
    if (ids === null) return;
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!emp || !ids.includes(emp.orgUnitId))
      throw new ForbiddenException('이 직원의 휴가를 볼 권한이 없습니다.');
  }

  private requestsOf(employeeId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { employeeId },
      include: { leaveType: { select: { name: true, code: true, deducts: true } } },
      orderBy: { startDate: 'desc' },
      take: 200,
    });
  }

  /** 한 직원의 휴가 — 잔여·신청 내역·조정 내역 */
  async employeeLeave(p: AuthPrincipal, employeeId: string) {
    await this.assertCanSee(p, employeeId);
    const [balance, requests, adjustments] = await Promise.all([
      this.balance(employeeId),
      this.requestsOf(employeeId),
      this.prisma.leaveAdjustment.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { balance, requests, adjustments };
  }

  myLeave(p: AuthPrincipal) {
    return this.employeeLeave(p, this.requireEmployee(p));
  }

  /** 전 직원 연차 현황(LEAVE.READ, 데이터 범위 안) */
  async summary(p: AuthPrincipal, hqOnly: boolean) {
    if (!this.canManage(p, 'READ'))
      throw new ForbiddenException('전 직원 휴가를 볼 권한이 없습니다.');
    const ids = await this.scope.orgScopeIds(p);
    const emps = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        ...(ids === null ? {} : { orgUnitId: { in: ids } }),
        ...(hqOnly ? { orgUnit: { type: { not: 'BRANCH' } } } : {}),
      },
      select: {
        id: true,
        name: true,
        hireDate: true,
        position: { select: { name: true, sortOrder: true } },
        orgUnit: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const b = await this.balances(emps.map((e) => e.id));
    return emps.map((e) => ({
      id: e.id,
      name: e.name,
      positionName: e.position?.name ?? null,
      orgUnitName: e.orgUnit?.name ?? null,
      ...b.get(e.id)!,
    }));
  }

  // ── 신청 ──

  async request(
    p: AuthPrincipal,
    input: {
      leaveTypeId: string;
      startDate: string;
      endDate?: string;
      reason?: string;
      slot?: LeaveSlot;
      substituteEmpId?: string;
      handover?: string;
      extra?: Record<string, unknown>;
      line?: ApprovalLineEntry[];
    },
  ) {
    const empId = this.requireEmployee(p);
    const type = await this.prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!type?.isActive) throw new BadRequestException('쓸 수 없는 휴가 종류입니다.');
    const unit = Number(type.unitDays);
    const half = unit < 1;
    const start = input.startDate.slice(0, 10);
    const end = half ? start : (input.endDate ?? start).slice(0, 10);
    if (end < start) throw new BadRequestException('끝 날짜가 시작 날짜보다 빠릅니다.');
    if (half && !isWorkday(start))
      throw new BadRequestException('반차·반반차는 근무일에만 쓸 수 있습니다.');

    // 시간대 — 반차는 오전/오후, 반반차는 Q1~Q4. 예전 '오전 반차·오후 반차' 종류는 이름으로 정해진다
    const slots = leaveSlotsFor(unit);
    const slot: LeaveSlot | null = !half
      ? null
      : (input.slot ?? (type.code.includes('PM') ? 'PM' : type.code.includes('AM') ? 'AM' : null));
    if (half && (!slot || !slots.includes(slot)))
      throw new BadRequestException(
        `시간대를 골라 주세요(${slots.map((x) => LEAVE_SLOT_LABEL[x]).join(' · ')}).`,
      );

    // 휴가 신청서 설정 — 업무 대리인·사유 필수, 관리자가 더한 항목
    const form = await this.forms.leaveForm();
    const settings = form.settings as LeaveFormSettings;
    if (settings.reasonRequired && !input.reason?.trim())
      throw new BadRequestException('휴가 사유를 적어 주세요.');
    let substitute: { id: string; name: string } | null = null;
    if (settings.substitute !== 'NONE' && input.substituteEmpId) {
      if (input.substituteEmpId === empId)
        throw new BadRequestException('업무 대리인은 본인이 아닌 다른 직원으로 골라 주세요.');
      substitute = await this.prisma.employee.findFirst({
        where: { id: input.substituteEmpId, isActive: true },
        select: { id: true, name: true },
      });
      if (!substitute) throw new BadRequestException('업무 대리인을 찾을 수 없습니다.');
    }
    if (settings.substitute === 'REQUIRED' && !substitute)
      throw new BadRequestException('업무 대리인을 골라 주세요.');
    const extra = await this.forms.cleanValues(form.fields, input.extra);
    const days = half ? unit : countWorkdays(start, end);
    if (days <= 0) throw new BadRequestException('고른 기간에 근무일이 없습니다(주말·공휴일).');

    // 같은 날짜에 이미 신청(결재 중·승인)한 휴가가 있으면 막는다
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: empId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: dateOnly(end) },
        endDate: { gte: dateOnly(start) },
      },
      include: { leaveType: { select: { name: true } } },
    });
    if (overlap)
      throw new BadRequestException(
        `이미 신청한 휴가(${overlap.leaveType.name} ${ymd(overlap.startDate)}~${ymd(overlap.endDate)})와 날짜가 겹칩니다.`,
      );

    if (type.deducts) {
      const bal = await this.balance(empId);
      const available = bal.remaining - bal.pending;
      if (days > available)
        throw new BadRequestException(
          `남은 연차가 부족합니다 — 쓸 수 있는 연차 ${available}일(결재 중 ${bal.pending}일 제외), 신청 ${days}일.`,
        );
    }

    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: empId },
      select: { name: true },
    });
    const period = start === end ? start : `${start} ~ ${end}`;
    // 이름에 이미 시간대가 들어간 종류(오전 반차)는 다시 붙이지 않는다
    const slotText =
      slot && !type.name.includes(LEAVE_SLOT_LABEL[slot]) ? ` ${LEAVE_SLOT_LABEL[slot]}` : '';
    const handover = input.handover?.trim() || null;
    const out = await this.prisma.$transaction(async (tx) => {
      const req = await tx.leaveRequest.create({
        data: {
          employeeId: empId,
          leaveTypeId: type.id,
          startDate: dateOnly(start),
          endDate: dateOnly(end),
          days,
          slot,
          substituteEmpId: substitute?.id ?? null,
          handover,
          extra: form.fields.length ? (extra as Prisma.InputJsonValue) : undefined,
          reason: input.reason?.trim() || null,
        },
      });
      const doc = await this.approvals.submit(tx, {
        docType: 'LEAVE',
        title: `${emp.name} ${type.name} (${period}${slotText}, ${days}일)`,
        content: input.reason?.trim() || null,
        payload: {
          leaveRequestId: req.id,
          leaveType: type.name,
          startDate: start,
          endDate: end,
          days,
          deducts: type.deducts,
          slot,
          slotLabel: slot ? LEAVE_SLOT_LABEL[slot] : null,
          substituteEmpId: substitute?.id ?? null,
          substituteName: substitute?.name ?? null,
          handover,
          // 결재 화면이 그때의 추가 항목 정의대로 보여 준다
          fields: form.fields,
          values: extra,
        },
        requesterEmpId: empId,
        line: input.line ?? null,
      });
      const updated = await tx.leaveRequest.update({
        where: { id: req.id },
        data: { approvalDocId: doc.id },
      });
      return { updated, doc };
    });
    await this.approvals.announceSubmitted(out.doc);
    return out.updated;
  }

  // ── 조정 ──

  async adjust(
    p: AuthPrincipal,
    input: { employeeId: string; days: number; reason: string; effectiveDate?: string },
  ) {
    await this.assertCanSee(p, input.employeeId, 'UPDATE');
    if (!input.days) throw new BadRequestException('조정 일수를 넣어 주세요(+/-).');
    return this.prisma.leaveAdjustment.create({
      data: {
        employeeId: input.employeeId,
        days: input.days,
        reason: input.reason.trim(),
        effectiveDate: dateOnly(input.effectiveDate ?? todayYmd()),
        createdByUserId: p.userId,
      },
    });
  }

  /**
   * 연차 일괄 부여·차감 — 고른 직원과 조직(하위 포함) 직원 전부에게 같은 일수를 한 줄씩 남긴다.
   * 데이터 범위 밖 직원은 빼고, 몇 명에게 넣었는지 돌려준다.
   */
  async bulkAdjust(
    p: AuthPrincipal,
    input: {
      employeeIds?: string[];
      orgUnitIds?: string[];
      days: number;
      reason: string;
      effectiveDate?: string;
    },
  ) {
    if (!input.days) throw new BadRequestException('부여(+)·차감(-)할 일수를 넣어 주세요.');
    if (Math.round(input.days * 4) !== input.days * 4)
      throw new BadRequestException('일수는 0.25일 단위로 넣어 주세요.');
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('사유를 적어 주세요.');
    const orgIds = input.orgUnitIds?.length
      ? await this.scope.withDescendants(input.orgUnitIds)
      : [];
    const scopeIds = await this.scope.orgScopeIds(p);
    const emps = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        OR: [
          ...(input.employeeIds?.length ? [{ id: { in: input.employeeIds } }] : []),
          ...(orgIds.length ? [{ orgUnitId: { in: orgIds } }] : []),
        ],
        ...(scopeIds === null ? {} : { orgUnitId: { in: scopeIds } }),
      },
      select: { id: true },
    });
    if (!input.employeeIds?.length && !orgIds.length)
      throw new BadRequestException('부여할 직원이나 조직을 골라 주세요.');
    if (!emps.length) throw new BadRequestException('부여할 수 있는 직원이 없습니다(데이터 범위).');
    const effectiveDate = dateOnly(input.effectiveDate ?? todayYmd());
    await this.prisma.leaveAdjustment.createMany({
      data: emps.map((e) => ({
        employeeId: e.id,
        days: input.days,
        reason,
        effectiveDate,
        createdByUserId: p.userId,
      })),
    });
    return { count: emps.length };
  }

  /** 최근 조정 이력(관리 화면) — 데이터 범위 안 */
  async adjustments(p: AuthPrincipal) {
    const scopeIds = await this.scope.orgScopeIds(p);
    return this.prisma.leaveAdjustment.findMany({
      where: scopeIds === null ? {} : { employee: { orgUnitId: { in: scopeIds } } },
      include: {
        employee: { select: { name: true, orgUnit: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── 캘린더·대시보드용 ──

  /** 기간 안의 승인된 휴가(조직 범위 안) */
  approvedBetween(from: string, to: string, orgIds: string[] | null) {
    return this.prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: dateOnly(to) },
        endDate: { gte: dateOnly(from) },
        ...(orgIds === null ? {} : { employee: { orgUnitId: { in: orgIds } } }),
      },
      include: {
        leaveType: { select: { name: true } },
        employee: { select: { name: true, orgUnitId: true, orgUnit: { select: { name: true } } } },
      },
      orderBy: { startDate: 'asc' },
    });
  }
}

export const leaveYmd = ymd;
export { todayYmd };
