import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canTransition, type AuthPrincipal, type LeadStatus } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
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

  /** 케이스 뷰: 한 접수의 전체 여정(고객 + 견적·계약·작업 문서흐름)을 한 번에. */
  async caseView(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal); // 존재 + 조직 스코프 검증
    return this.prisma.lead.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phonePrimary: true } },
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
          },
          orderBy: { createdAt: 'asc' },
        },
        workOrders: {
          select: { id: true, workNo: true, status: true, scheduledDate: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(dto: CreateLeadDto) {
    const data = {
      leadNo: this.genLeadNo(),
      orgUnitId: dto.orgUnitId,
      customerId: dto.customerId,
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

  async update(id: string, dto: UpdateLeadDto) {
    await this.findOne(id);
    try {
      return await this.prisma.lead.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          ownerEmpId: dto.ownerEmpId,
          partnerId: dto.partnerId,
          source: dto.source,
          serviceLine: dto.serviceLine,
          fromZipcode: dto.fromZipcode,
          fromAddr: dto.fromAddr,
          toZipcode: dto.toZipcode,
          toAddr: dto.toAddr,
          moveDate: dto.moveDate ? new Date(dto.moveDate) : undefined,
          visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /** 상태 전이(상태머신). 다른 모듈(계약·작업)에서도 호출. */
  async transitionTo(id: string, to: LeadStatus) {
    const lead = await this.findOne(id);
    const from = lead.status as LeadStatus;
    if (from === to) return lead;
    if (!canTransition(from, to)) {
      throw new BadRequestException(`허용되지 않은 상태 전이: ${from} → ${to}`);
    }
    const updated = await this.prisma.lead.update({ where: { id }, data: { status: to } });
    await this.eventBus.record({
      aggregateType: 'lead',
      aggregateId: id,
      eventType: 'lead.status_changed',
      payload: { from, to, leadNo: lead.leadNo },
    });
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.lead.delete({ where: { id } });
  }

  private genLeadNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
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
