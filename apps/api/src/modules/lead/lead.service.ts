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
import { DocNoService } from '../../prisma/doc-no.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EMPLOYEE_BRIEF_SELECT } from '../../common/employee-brief';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

interface LeadFilter {
  status?: string;
  source?: string;
  orgUnitId?: string;
}

/** 접수 목록 검색 — 화면의 필터·검색·상태 탭을 서버에서 건다 */
export interface LeadSearch {
  q?: string;
  /** ALL | 상태 | REJECTED(반려) | CONTRACT_PENDING(견적완료 포함) */
  stage?: string;
  /** 기간 기준 칸 */
  period?: 'createdAt' | 'moveDate' | 'visitDate';
  from?: string;
  to?: string;
  source?: string[];
  serviceLine?: string[];
  fromSido?: string[];
  owner?: 'yes' | 'no';
  contract?: 'yes' | 'no';
}

/** 한 번에 보내는 최대 행 수 — 넘으면 limited로 알린다(필터·검색으로 좁히게) */
const SEARCH_LIMIT = 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNo: DocNoService,
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
      include: {
        customer: { select: { id: true, name: true, phonePrimary: true } },
        partner: { select: { id: true, name: true, type: true } },
        // 계약서 칸 — 최근 계약 1건(누르면 계약서 문서)
        contracts: {
          select: { id: true, contractNo: true, status: true, estimateId: true, signedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        // 담당자 칩 — 누르면 프로필 요약(이름·직책·소속·연락처)
        ownerEmp: { select: EMPLOYEE_BRIEF_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** 화면 상태(탭) 조건 — 반려는 접수 상태 중 반려된 것, 계약미승인에는 견적완료(QUOTED)도 */
  private stageWhere(stage?: string): Prisma.LeadWhereInput {
    if (!stage || stage === 'ALL') return {};
    // 여러 상태(쉼표로 이어 보냄) — 하나라도 맞으면
    const many = stage.split(',').filter(Boolean);
    if (many.length > 1) return { OR: many.map((s) => this.stageWhere(s)) };
    if (stage === 'REJECTED') return { status: 'RECEIVED', rejectedAt: { not: null } };
    if (stage === 'RECEIVED') return { status: 'RECEIVED', rejectedAt: null };
    if (stage === 'CONTRACT_PENDING') return { status: { in: ['CONTRACT_PENDING', 'QUOTED'] } };
    return { status: stage };
  }

  async search(f: LeadSearch, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    const and: Prisma.LeadWhereInput[] = [];
    if (ids !== null) and.push({ orgUnitId: { in: ids } });
    const q = f.q?.trim();
    if (q) {
      const digits = q.replace(/\D/g, '');
      and.push({
        OR: [
          { leadNo: { contains: q, mode: 'insensitive' } },
          { legacyNo: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { phonePrimary: { contains: q } } },
          // 하이픈 없이 친 번호(01012345678)도 — 저장값은 010-1234-5678
          ...(digits.length >= 4 && digits !== q
            ? [{ customer: { phonePrimary: { contains: digits } } }]
            : []),
          ...(digits.length >= 7 && /^\d+$/.test(q)
            ? [
                {
                  customer: {
                    phonePrimary: {
                      contains: digits.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3'),
                    },
                  },
                },
              ]
            : []),
          { fromAddr: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if ((f.from && DAY_RE.test(f.from)) || (f.to && DAY_RE.test(f.to))) {
      const key = f.period ?? 'createdAt';
      const from = f.from && DAY_RE.test(f.from) ? f.from : undefined;
      const to = f.to && DAY_RE.test(f.to) ? f.to : undefined;
      if (key === 'createdAt') {
        // 접수일시는 한국 시각 날짜로
        const next = to
          ? new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86_400_000)
          : undefined;
        and.push({
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00+09:00`) } : {}),
            ...(next ? { lt: next } : {}),
          },
        });
      } else {
        and.push({
          [key]: {
            ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
          },
        });
      }
    }
    if (f.source?.length) and.push({ source: { in: f.source } });
    if (f.serviceLine?.length) and.push({ serviceLine: { in: f.serviceLine } });
    if (f.fromSido?.length) and.push({ fromSido: { in: f.fromSido } });
    if (f.owner === 'yes') and.push({ ownerEmpId: { not: null } });
    if (f.owner === 'no') and.push({ ownerEmpId: null });
    if (f.contract === 'yes') and.push({ contracts: { some: {} } });
    if (f.contract === 'no') and.push({ contracts: { none: {} } });

    const base: Prisma.LeadWhereInput = { AND: and };
    const where: Prisma.LeadWhereInput = { AND: [...and, this.stageWhere(f.stage)] };
    const [rows, byStatus, rejected, regions] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phonePrimary: true } },
          partner: { select: { id: true, name: true, type: true } },
          contracts: {
            select: { id: true, contractNo: true, status: true, estimateId: true, signedAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          ownerEmp: { select: EMPLOYEE_BRIEF_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: SEARCH_LIMIT + 1,
      }),
      // 상태 탭 숫자 — 필터·검색은 걸고 탭(상태)만 빼고 센다
      this.prisma.lead.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.lead.count({ where: { AND: [...and, this.stageWhere('REJECTED')] } }),
      // 출발지 지역 고르기 목록 — 볼 수 있는 접수 전체 기준
      this.prisma.lead.groupBy({
        by: ['fromSido'],
        where: { AND: ids === null ? [] : [{ orgUnitId: { in: ids } }], fromSido: { not: null } },
        orderBy: { fromSido: 'asc' },
      }),
    ]);
    const counts: Record<string, number> = { ALL: 0, REJECTED: rejected };
    for (const g of byStatus) {
      counts.ALL += g._count._all;
      const k = g.status === 'QUOTED' ? 'CONTRACT_PENDING' : g.status;
      counts[k] = (counts[k] ?? 0) + g._count._all;
    }
    counts.RECEIVED = (counts.RECEIVED ?? 0) - rejected;
    return {
      rows: rows.slice(0, SEARCH_LIMIT),
      limited: rows.length > SEARCH_LIMIT,
      counts,
      regions: regions.map((r) => r.fromSido as string),
    };
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
    const ids = await this.scope.orgScopeIds(principal);
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phonePrimary: true } },
        orgUnit: { select: { id: true, name: true } },
        ownerEmp: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true, type: true, benefit: true, intake: true } },
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
    // CS·AS 이력은 고객 기준(접수에 직접 FK 없음) — 다른 지점이 받은 건은 내 범위 밖이라 뺀다
    const supportTickets = lead?.customerId
      ? await this.prisma.supportTicket.findMany({
          where: {
            customerId: lead.customerId,
            ...(ids === null ? {} : { orgUnitId: { in: ids } }),
          },
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

  /**
   * 중복 접수 찾기 — 같은 출발지 주소·같은 서비스 요청일(이사일)로 이미 들어온 접수(취소 건 빼고).
   * 부부가 따로 전화하는 경우 등 — 접수 전에 알려 하나로 진행하게 한다.
   */
  async duplicates(fromAddr: string, moveDate: string, principal?: AuthPrincipal) {
    const addr = fromAddr.trim();
    if (!addr || !/^\d{4}-\d{2}-\d{2}/.test(moveDate)) return [];
    const ids = await this.scope.orgScopeIds(principal);
    const rows = await this.prisma.lead.findMany({
      where: {
        fromAddr: { equals: addr, mode: 'insensitive' },
        moveDate: new Date(moveDate.slice(0, 10)),
        status: { not: 'CANCELED' },
        ...(ids !== null && { orgUnitId: { in: ids } }),
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: {
        id: true,
        leadNo: true,
        status: true,
        rejectedAt: true,
        createdAt: true,
        fromAddrDetail: true,
        customer: { select: { name: true, phonePrimary: true } },
        orgUnit: { select: { name: true } },
        ownerEmp: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      leadNo: r.leadNo,
      status: r.status,
      rejected: !!r.rejectedAt && r.status === 'RECEIVED',
      createdAt: r.createdAt,
      fromAddrDetail: r.fromAddrDetail,
      customerName: r.customer?.name ?? null,
      customerPhone: r.customer?.phonePrimary ?? null,
      orgName: r.orgUnit?.name ?? null,
      ownerName: r.ownerEmp?.name ?? null,
      // 새 접수로 대체(먼저 건 취소)할 수 있는지 — 작업까지 끝난 건은 못 바꾼다
      replaceable: canTransition(r.status as LeadStatus, 'CANCELED'),
    }));
  }

  async create(dto: CreateLeadDto, principal?: AuthPrincipal) {
    // 중복 접수를 대체하면 먼저 건을 볼 수 있고 취소할 수 있는지 먼저 확인한다(새 접수만 남는 일이 없게)
    const replaced = dto.replaceLeadId ? await this.findOne(dto.replaceLeadId, principal) : null;
    if (replaced && !canTransition(replaced.status as LeadStatus, 'CANCELED'))
      throw new BadRequestException('먼저 접수된 건은 이미 끝나 대체할 수 없습니다.');
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
    await this.assertPartnerAssignable(dto.partnerId, dto.orgUnitId);
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
    // 고른 고객도, 번호로 찾는 고객도 내 범위 안에서만 — 다른 지점 고객 번호를 넣어 이름·이력을 알아내지 못하게
    // (범위 밖 같은 번호 고객이 있어도 알려 주지 않고 내 지점 고객을 새로 만든다)
    await this.scope.assertCustomer(dto.customerId, principal);
    let customerId = dto.customerId;
    if (!customerId && dto.customerPhone?.trim()) {
      const existing = await this.findCustomerByPhone(dto.customerPhone, ids);
      if (existing) customerId = existing.id;
    }
    // 기존 고객(고른 고객·같은 번호 고객)인데 접수 화면에서 이름을 고쳐 적었으면 고객 이름도 바꾼다
    // (예: 예전에 '테스트'로 저장된 번호 → 이번에 '홍길동'으로 접수). 견적서·통화 기록이 고객 이름을 따라간다
    const typedName = dto.customerName?.trim();
    if (customerId && typedName) {
      await this.prisma.customer.updateMany({
        where: { id: customerId, NOT: { name: typedName } },
        data: { name: typedName },
      });
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
      await this.eventBus.record({
        aggregateType: 'customer',
        aggregateId: customer.id,
        eventType: 'customer.created',
        payload: { ownerOrgId: customer.ownerOrgId, via: 'lead' },
      });
    }
    // 담당자는 등록한 본인 — 슈퍼관리자만 다른 직원으로 정할 수 있다
    const superAdmin = !!principal?.permissions.includes('*');
    const data = {
      leadNo: await this.docNo.next('RC'),
      orgUnitId: dto.orgUnitId,
      customerId,
      ownerEmpId: superAdmin ? dto.ownerEmpId : (principal?.employeeId ?? dto.ownerEmpId),
      partnerId: dto.partnerId,
      source: dto.source,
      // 제휴·전속 상품이면 상품 구분은 이사(MOVING)
      serviceLine: dto.serviceLine ?? (dto.partnerId ? 'MOVING' : undefined),
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
      customerRequest: dto.customerRequest?.trim() || undefined,
      productNote: dto.productNote?.trim() || (await this.partnerNote(dto.partnerId)) || undefined,
      dupOfLeadId: replaced?.id,
    };
    try {
      const created = await this.prisma.lead.create({ data });
      await this.eventBus.record({
        aggregateType: 'lead',
        aggregateId: created.id,
        eventType: 'lead.created',
        payload: {
          leadNo: created.leadNo,
          source: created.source,
          orgUnitId: created.orgUnitId,
          customerId: created.customerId,
          ownerEmpId: created.ownerEmpId,
          by: principal?.employeeId ?? null,
        },
      });
      // 중복 접수 대체 — 먼저 건은 '중복 접수'로 취소(사유에 새 접수 번호)
      if (replaced)
        await this.cancel(
          replaced.id,
          { kind: '중복 접수', reason: `${created.leadNo}(으)로 다시 접수해 진행` },
          principal,
        );
      return created;
    } catch (e) {
      throw this.mapError(e);
    }
  }

  /**
   * 전속이사(전속 계약사 임직원 이사)는 본사에서만 배정한다 — 지점(가맹·직영)에는 걸 수 없다.
   * 제휴이사는 가맹점에도 배정할 수 있다.
   */
  private async assertPartnerAssignable(partnerId: string | null | undefined, orgUnitId: string) {
    if (!partnerId) return;
    const [partner, org] = await Promise.all([
      this.prisma.partner.findUnique({
        where: { id: partnerId },
        select: { type: true, name: true },
      }),
      this.prisma.orgUnit.findUnique({
        where: { id: orgUnitId },
        select: { type: true, name: true },
      }),
    ]);
    if (!partner) throw new BadRequestException('제휴·전속 업체를 목록에서 다시 골라 주세요.');
    if (partner.type === 'EXCLUSIVE' && (org?.type === 'BRANCH' || org?.type === 'PARTNER'))
      throw new BadRequestException(
        `전속이사(${partner.name})는 본사에서만 배정합니다. 담당을 본사 부서로 바꿔 주세요(지금: ${org?.name ?? '지점'}).`,
      );
  }

  /** 전화번호(숫자만 비교)로 고객 찾기 — 가장 먼저 등록된 고객. ids(데이터 범위)가 있으면 그 안(+담당 지점 없음)에서만 */
  /** 제휴·전속 업체의 혜택·메모 → 접수의 상품 특이사항 */
  private async partnerNote(partnerId?: string | null) {
    if (!partnerId) return null;
    const p = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { benefit: true, memo: true },
    });
    const text = [p?.benefit?.trim(), p?.memo?.trim()].filter(Boolean).join('\n\n');
    return text || null;
  }

  private async findCustomerByPhone(phone: string, ids: string[] | null) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) return null;
    const rows =
      ids === null
        ? await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${digits}
      ORDER BY created_at ASC
      LIMIT 1`
        : await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${digits}
        AND (owner_org_id IS NULL OR owner_org_id = ANY(${ids}::uuid[]))
      ORDER BY created_at ASC
      LIMIT 1`;
    return rows[0] ?? null;
  }

  async update(id: string, dto: UpdateLeadDto, principal?: AuthPrincipal) {
    const before = await this.findOne(id, principal);
    if (dto.partnerId) await this.assertPartnerAssignable(dto.partnerId, before.orgUnitId);
    await this.scope.assertCustomer(dto.customerId, principal);
    let updated;
    try {
      updated = await this.prisma.lead.update({
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
          customerRequest:
            dto.customerRequest === undefined ? undefined : dto.customerRequest.trim() || null,
          // 업체를 바꾸면(적어 준 내용이 없을 때) 새 업체의 혜택·메모로 바꾼다
          productNote:
            dto.productNote !== undefined
              ? dto.productNote.trim() || null
              : dto.partnerId !== undefined && dto.partnerId !== before.partnerId
                ? await this.partnerNote(dto.partnerId)
                : undefined,
        },
      });
    } catch (e) {
      throw this.mapError(e);
    }
    // 담당자가 새로 정해지거나 바뀌면 배정 이벤트(담당자 안내·자동 배분 에이전트용)
    if (updated.ownerEmpId && updated.ownerEmpId !== before.ownerEmpId) {
      await this.eventBus.record({
        aggregateType: 'lead',
        aggregateId: updated.id,
        eventType: 'lead.assigned',
        payload: {
          leadNo: updated.leadNo,
          ownerEmpId: updated.ownerEmpId,
          fromOwnerEmpId: before.ownerEmpId ?? null,
          orgUnitId: updated.orgUnitId,
          by: principal?.employeeId ?? null,
        },
      });
    }
    // 담당 지점이 바뀌면(이관) 고객 이력에 남긴다
    if (updated.orgUnitId !== before.orgUnitId) {
      await this.eventBus.record({
        aggregateType: 'lead',
        aggregateId: updated.id,
        eventType: 'lead.org_changed',
        payload: {
          leadNo: updated.leadNo,
          orgUnitId: updated.orgUnitId,
          fromOrgUnitId: before.orgUnitId,
          by: principal?.employeeId ?? null,
        },
      });
    }
    return updated;
  }

  /** 상태 전이(상태머신). 다른 모듈(계약·작업)에서도 호출. */
  async transitionTo(id: string, to: LeadStatus, principal?: AuthPrincipal) {
    const lead = await this.findOne(id, principal);
    const result = await this.transitionInTx(this.prisma, id, to);
    await this.emitTransition(result, to, principal?.employeeId);
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
    by?: string | null,
  ) {
    if (!result.changed) return;
    await this.eventBus.record({
      aggregateType: 'lead',
      aggregateId: result.lead.id,
      eventType: 'lead.status_changed',
      payload: { from: result.from, to, leadNo: result.lead.leadNo, by: by ?? null },
    });
  }

  /**
   * 지점 반려 — 지점에서 처리할 수 없거나 마감이라 본사로 되돌린다.
   * 담당 지점은 본사(CO-MOVING), 담당자는 비우고 상태는 '접수'로. 형태·사유·반려한 지점을 남긴다.
   * 계약 이후(계약·작업)에는 반려할 수 없다.
   */
  async reject(id: string, input: { kind: string; reason?: string }, principal?: AuthPrincipal) {
    const lead = await this.findOne(id, principal);
    const hq = await this.prisma.orgUnit.findFirst({
      where: { code: 'CO-MOVING' },
      select: { id: true },
    });
    if (!hq) throw new BadRequestException('본사 조직(CO-MOVING)을 찾지 못했습니다.');
    const org = await this.prisma.orgUnit.findUnique({
      where: { id: lead.orgUnitId },
      select: { type: true },
    });
    if (lead.orgUnitId === hq.id || (org?.type !== 'BRANCH' && org?.type !== 'PARTNER'))
      throw new BadRequestException('지점(가맹점)에 배정된 접수만 반려할 수 있습니다.');
    const from = lead.status as LeadStatus;
    if (LEAD_STATUS.indexOf(from) >= LEAD_STATUS.indexOf('CONTRACT_PENDING'))
      throw new BadRequestException(
        `${LEAD_STATUS_LABEL[from]} 단계의 접수는 반려할 수 없습니다(계약 이후).`,
      );
    const reason = input.reason?.trim() || null; // 메모(선택)
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        orgUnitId: hq.id,
        ownerEmpId: null,
        status: 'RECEIVED',
        rejectKind: input.kind,
        rejectReason: reason,
        rejectedAt: new Date(),
        rejectedFromOrgId: lead.orgUnitId,
      },
    });
    // 견적도 본사로 — 다음에 배정받는 지점이 이어서 보게(계약 전이라 문서는 아직 견적뿐)
    await this.prisma.estimate.updateMany({ where: { leadId: id }, data: { orgUnitId: hq.id } });
    await this.eventBus.record({
      aggregateType: 'lead',
      aggregateId: id,
      eventType: 'lead.rejected',
      payload: {
        leadNo: lead.leadNo,
        fromOrgUnitId: lead.orgUnitId,
        orgUnitId: hq.id,
        fromOwnerEmpId: lead.ownerEmpId,
        fromStatus: from,
        kind: input.kind,
        reason,
        by: principal?.employeeId ?? null,
      },
    });
    return updated;
  }

  /** 접수 취소 — 형태·사유를 남긴다 */
  async cancel(id: string, input: { kind: string; reason: string }, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    const result = await this.transitionInTx(this.prisma, id, 'CANCELED');
    const reason = input.reason.trim();
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { cancelKind: input.kind, cancelReason: reason },
    });
    await this.emitTransition(result, 'CANCELED', principal?.employeeId);
    await this.eventBus.record({
      aggregateType: 'lead',
      aggregateId: id,
      eventType: 'lead.canceled',
      payload: {
        leadNo: updated.leadNo,
        kind: input.kind,
        reason,
        by: principal?.employeeId ?? null,
      },
    });
    return updated;
  }

  async remove(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.lead.delete({ where: { id } });
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
