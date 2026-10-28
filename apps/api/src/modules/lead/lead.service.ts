import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransition,
  LEAD_STATUS,
  LEAD_STATUS_LABEL,
  type AuthPrincipal,
  type LeadStatus,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstYmd } from '../../common/util/kst';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

interface LeadFilter {
  status?: string;
  source?: string;
  orgUnitId?: string;
}

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly scope: ScopeService,
  ) {}

  async findAll(filter: LeadFilter, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    return this.prisma.lead.findMany({
      where: {
        status: filter.status,
        source: filter.source,
        orgUnitId: ids === null ? filter.orgUnitId : { in: ids },
      },
      include: { customer: { select: { id: true, name: true, phonePrimary: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`리드를 찾을 수 없습니다: ${id}`);
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(lead.orgUnitId)) {
      throw new ForbiddenException('소속 조직의 리드만 조회할 수 있습니다.');
    }
    return lead;
  }

  /** 케이스 뷰: 한 접수의 전체 여정(고객 + 견적·계약·결제·작업 문서흐름 + CS·AS 이력)을 한 번에. */
  async caseView(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal); // 존재 + 조직 스코프 검증
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phonePrimary: true } },
        orgUnit: { select: { id: true, name: true } },
        ownerEmp: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
        estimates: {
          select: {
            id: true,
            estimateNo: true,
            status: true,
            totalCbm: true,
            totalAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        contracts: {
          select: {
            id: true,
            contractNo: true,
            status: true,
            totalAmount: true,
            signedAt: true,
            createdAt: true,
            payments: {
              select: { id: true, kind: true, amount: true, status: true, paidAt: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        workOrders: {
          select: { id: true, workNo: true, status: true, scheduledDate: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // CS·AS 이력은 고객 기준(접수에 직접 FK 없음)
    const supportTickets = lead?.customerId
      ? await this.prisma.supportTicket.findMany({
          where: { customerId: lead.customerId },
          select: {
            id: true,
            kind: true,
            subject: true,
            status: true,
            priority: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [];
    return { ...lead, supportTickets };
  }

  async create(dto: CreateLeadDto, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null && !ids.includes(dto.orgUnitId)) {
      throw new ForbiddenException('소속 조직으로만 접수할 수 있습니다.');
    }
    // 없는 지점이면 고객부터 만들다 FK 오류(500)가 나므로 먼저 확인한다
    const org = await this.prisma.orgUnit.findUnique({
      where: { id: dto.orgUnitId },
      select: { id: true },
    });
    if (!org) throw new BadRequestException('담당 지점을 목록에서 다시 골라 주세요.');
    if (dto.customerPhone?.trim()) {
      const digits = dto.customerPhone.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 11) {
        throw new BadRequestException('연락처는 숫자 9~11자리로 입력해 주세요(예: 010-1234-5678).');
      }
    }
    if (!dto.customerId && !dto.customerName?.trim()) {
      throw new BadRequestException('고객명을 입력해 주세요.');
    }
    // 신규 접수: 고객명 입력 시 고객 자동 생성·연결(드롭다운 선택은 customerId).
    // 같은 전화번호의 고객이 이미 있으면 새로 만들지 않고 그 고객에 잇는다(같은 사람이 두 번 생기면
    // 문자가 두 번 가고 이력이 갈라진다). 번호는 하이픈·공백을 빼고 비교한다.
    let customerId = dto.customerId;
    if (!customerId && dto.customerPhone?.trim()) {
      const existing = await this.findCustomerByPhone(dto.customerPhone);
      if (existing) customerId = existing.id;
    }
    if (!customerId && dto.customerName?.trim()) {
      const customer = await this.prisma.customer.create({
        data: {
          name: dto.customerName.trim(),
          phonePrimary: dto.customerPhone,
          ownerOrgId: dto.orgUnitId,
        },
      });
      customerId = customer.id;
    }
    const data = {
      leadNo: this.genLeadNo(),
      orgUnitId: dto.orgUnitId,
      customerId,
      ownerEmpId: dto.ownerEmpId,
      partnerId: dto.partnerId,
      source: dto.source,
      serviceLine: dto.serviceLine,
      fromZipcode: dto.fromZipcode,
      fromAddr: dto.fromAddr,
      fromAddrDetail: dto.fromAddrDetail,
      fromSido: dto.fromSido,
      fromSigungu: dto.fromSigungu,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toZipcode: dto.toZipcode,
      toAddr: dto.toAddr,
      toAddrDetail: dto.toAddrDetail,
      toSido: dto.toSido,
      toSigungu: dto.toSigungu,
      toLat: dto.toLat,
      toLng: dto.toLng,
      moveDate: dto.moveDate ? new Date(dto.moveDate) : undefined,
      visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
    };
    try {
      const created = await this.prisma.lead.create({ data });
      await this.eventBus.record({
        aggregateType: 'lead',
        aggregateId: created.id,
        eventType: 'lead.created',
        payload: { leadNo: created.leadNo, source: created.source, orgUnitId: created.orgUnitId },
      });
      return created;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** 전화번호(숫자만 비교)로 고객 찾기 — 가장 먼저 등록된 고객 */
  private async findCustomerByPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) return null;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${digits}
      ORDER BY created_at ASC
      LIMIT 1`;
    return rows[0] ?? null;
  }

  async update(id: string, dto: UpdateLeadDto, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    try {
      return await this.prisma.lead.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          ownerEmpId: dto.ownerEmpId,
          partnerId: dto.partnerId,
          source: dto.source,
          serviceLine: dto.serviceLine,
          // 주소는 생성 때와 동일하게 구조적 필드(상세·시도/시군구·좌표)까지 함께 갱신
          fromZipcode: dto.fromZipcode,
          fromAddr: dto.fromAddr,
          fromAddrDetail: dto.fromAddrDetail,
          fromSido: dto.fromSido,
          fromSigungu: dto.fromSigungu,
          fromLat: dto.fromLat,
          fromLng: dto.fromLng,
          toZipcode: dto.toZipcode,
          toAddr: dto.toAddr,
          toAddrDetail: dto.toAddrDetail,
          toSido: dto.toSido,
          toSigungu: dto.toSigungu,
          toLat: dto.toLat,
          toLng: dto.toLng,
          moveDate: dto.moveDate ? new Date(dto.moveDate) : undefined,
          visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** 상태 전이(상태머신). 다른 모듈(계약·작업)에서도 호출. */
  async transitionTo(id: string, to: LeadStatus, principal?: AuthPrincipal) {
    const lead = await this.findOne(id, principal);
    const result = await this.transitionInTx(this.prisma, id, to);
    await this.emitTransition(result, to);
    return result.changed ? result.lead : lead;
  }

  /**
   * 트랜잭션 안에서의 상태 전이 — 문서(견적확정·계약·작업오더) 생성과 원자적으로 묶기 위해
   * tx 클라이언트를 받는다. 전이가 막히면 예외로 문서 쓰기까지 함께 롤백된다.
   * 조직 스코프는 호출한 문서 쪽에서 이미 검증된 것으로 본다(같은 조직의 리드).
   * 이벤트 기록은 커밋 후 emitTransition()으로 따로 한다.
   */
  async transitionInTx(tx: Prisma.TransactionClient, id: string, to: LeadStatus) {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`리드를 찾을 수 없습니다: ${id}`);
    const from = lead.status as LeadStatus;
    if (from === to) return { lead, from, changed: false };
    if (!canTransition(from, to)) {
      throw new BadRequestException(`허용되지 않은 상태 전이: ${from} → ${to}`);
    }
    const updated = await tx.lead.update({ where: { id }, data: { status: to } });
    return { lead: updated, from, changed: true };
  }

  /**
   * 업무 흐름이 앞으로 나아가며 생기는 전이(견적 확정·계약·작업 생성) — 중간 단계를 건너뛰어도 된다.
   * 예: 접수 상태에서 바로 견적을 확정하면 상담배정·상담토스를 건너 견적완료로.
   * 이미 그 단계거나 지났으면 그대로 두고(두 번째 견적 확정 등), 완료·취소된 접수만 막는다.
   */
  async advanceInTx(tx: Prisma.TransactionClient, id: string, to: LeadStatus) {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`리드를 찾을 수 없습니다: ${id}`);
    const from = lead.status as LeadStatus;
    if (from === 'CANCELED' || from === 'DONE') {
      throw new BadRequestException(
        `${LEAD_STATUS_LABEL[from]}된 접수입니다 — ${LEAD_STATUS_LABEL[to]}(으)로 진행할 수 없습니다.`,
      );
    }
    if (LEAD_STATUS.indexOf(from) >= LEAD_STATUS.indexOf(to)) {
      return { lead, from, changed: false };
    }
    const updated = await tx.lead.update({ where: { id }, data: { status: to } });
    return { lead: updated, from, changed: true };
  }

  /** transitionInTx 커밋 후 상태변경 이벤트 기록(전이가 실제로 일어났을 때만). */
  async emitTransition(
    result: { lead: { id: string; leadNo: string }; from: LeadStatus; changed: boolean },
    to: LeadStatus,
  ) {
    if (!result.changed) return;
    await this.eventBus.record({
      aggregateType: 'lead',
      aggregateId: result.lead.id,
      eventType: 'lead.status_changed',
      payload: { from: result.from, to, leadNo: result.lead.leadNo },
    });
  }

  async remove(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.lead.delete({ where: { id } });
  }

  private genLeadNo(): string {
    const ymd = kstYmd(); // 한국 날짜(서버는 UTC)
    const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    return `R${ymd}${rand}`;
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException('접수번호 충돌 — 다시 시도하세요.');
      if (e.code === 'P2003')
        return new BadRequestException('참조 대상(조직/고객/직원/거래처)이 존재하지 않습니다.');
    }
    return e as Error;
  }
}
