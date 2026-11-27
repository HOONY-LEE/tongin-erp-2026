import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { LIST_LIMIT, listWhere, type ListFilterRules } from '../../common/list-filter';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../events/event-bus.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const GRADE_GROUP = 'CUSTOMER_GRADE';

/** 고객 목록 필터(화면 FilterButton key → 칸) */
const LIST_RULES: ListFilterRules = {
  createdAt: { date: { createdAt: ['createdAt', 'ts'] } },
  grade: { in: 'grade' },
  ownerOrgId: { in: 'ownerOrgId' },
  smsOptOut: { one: { true: { smsOptOut: true }, false: { smsOptOut: false } } },
};

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * 고객은 담당 지점(ownerOrgId) 기준. 아직 지점이 배정되지 않은 고객(null)은
   * 누구에게도 막지 않는다 — 접수/견적에서 선택할 수 있어야 하기 때문.
   */
  private async scopeWhere(principal?: AuthPrincipal): Promise<Prisma.CustomerWhereInput | null> {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null) return null;
    return { OR: [{ ownerOrgId: { in: ids } }, { ownerOrgId: null }] };
  }

  private async assertScope(ownerOrgId: string | null, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null || ownerOrgId === null) return;
    if (!ids.includes(ownerOrgId)) {
      throw new ForbiddenException('소속 지점의 고객만 다룰 수 있습니다.');
    }
  }

  async findAll(phone?: string, principal?: AuthPrincipal, f?: string, q?: string) {
    const scoped = await this.scopeWhere(principal);
    return this.prisma.customer.findMany({
      where: {
        ...(phone ? { phonePrimary: phone.replace(/\D/g, '') } : {}),
        ...(scoped ?? {}),
        AND: listWhere(
          LIST_RULES,
          f,
          q,
          ['customerNo', 'legacyNo', 'name', 'addr', 'phonePrimary'],
          ['phonePrimary'],
        ),
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  /** 고객 등급 — 공통코드 CUSTOMER_GRADE(관리자가 고객관리 설정에서 정의) */
  grades() {
    return this.prisma.commonCode.findMany({
      where: { codeGroup: GRADE_GROUP, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { code: true, name: true },
    });
  }

  /** 등급은 정의된 값만 — 없는 값이면 400 */
  private async assertGrade(grade?: string | null) {
    if (!grade) return;
    const ok = await this.prisma.commonCode.findFirst({
      where: { codeGroup: GRADE_GROUP, code: grade },
      select: { id: true },
    });
    if (!ok) throw new BadRequestException(`없는 고객 등급입니다: ${grade}`);
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const found = await this.prisma.customer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`고객을 찾을 수 없습니다: ${id}`);
    await this.assertScope(found.ownerOrgId, principal);
    return found;
  }

  /** 고객의 계약서(취소 제외, 최근 순 20건) */
  async contracts(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    const rows = await this.prisma.contract.findMany({
      where: { customerId: id, status: { not: 'CANCELED' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        contractNo: true,
        estimateId: true,
        status: true,
        contractDate: true,
        lead: { select: { leadNo: true, moveDate: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      contractNo: c.contractNo,
      estimateId: c.estimateId,
      status: c.status,
      contractDate: c.contractDate ? c.contractDate.toISOString().slice(0, 10) : null,
      leadNo: c.lead?.leadNo ?? null,
      moveDate: c.lead?.moveDate ? c.lead.moveDate.toISOString().slice(0, 10) : null,
    }));
  }

  /**
   * 전화번호는 고객 한 명에게만 — 같은 번호가 이미 있으면 409.
   * 하이픈·공백을 빼고 비교한다. 다른 지점 고객이어도 막되, 이름 등은 알려 주지 않는다.
   */
  private async assertPhoneFree(phone: string | null | undefined, exceptId?: string) {
    const d = (phone ?? '').replace(/\D/g, '');
    if (d.length < 9) return;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${d}
      LIMIT 2`;
    if (rows.some((r) => r.id !== exceptId))
      throw new ConflictException(
        '이미 등록된 전화번호입니다. 고객 목록에서 그 번호로 찾아 주세요(다른 지점 고객이면 본사에 문의).',
      );
  }

  async create(dto: CreateCustomerDto, principal?: AuthPrincipal) {
    await this.assertScope(dto.ownerOrgId ?? null, principal);
    await this.assertGrade(dto.grade);
    await this.assertPhoneFree(dto.phonePrimary);
    let created;
    try {
      created = await this.prisma.customer.create({
        data: { ...dto, ...(dto.smsOptOut ? { smsOptOutAt: new Date() } : {}) },
      });
    } catch (e) {
      throw this.mapError(e);
    }
    // 이름·연락처는 싣지 않는다(개인정보) — 필요하면 id로 조회
    await this.eventBus.record({
      aggregateType: 'customer',
      aggregateId: created.id,
      eventType: 'customer.created',
      payload: { ownerOrgId: created.ownerOrgId, via: 'customer' },
    });
    return created;
  }

  async update(id: string, dto: UpdateCustomerDto, principal?: AuthPrincipal) {
    const cur = await this.findOne(id, principal);
    if (dto.ownerOrgId !== undefined) await this.assertScope(dto.ownerOrgId ?? null, principal);
    if (dto.grade !== undefined) await this.assertGrade(dto.grade);
    // 번호를 바꿀 때만 확인(예전부터 겹쳐 있던 고객도 이름·등급은 고칠 수 있게)
    const digitsOf = (x: string | null | undefined) => (x ?? '').replace(/\D/g, '');
    if (dto.phonePrimary && digitsOf(dto.phonePrimary) !== digitsOf(cur.phonePrimary))
      await this.assertPhoneFree(dto.phonePrimary, id);
    try {
      // 수신거부를 켠 시각을 남긴다(끄면 비운다)
      const optOut =
        dto.smsOptOut === undefined || dto.smsOptOut === cur.smsOptOut
          ? {}
          : { smsOptOutAt: dto.smsOptOut ? new Date() : null };
      return await this.prisma.customer.update({ where: { id }, data: { ...dto, ...optOut } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.customer.delete({ where: { id } });
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return new BadRequestException('존재하지 않는 조직단위(ownerOrgId)입니다.');
    }
    return e as Error;
  }
}
