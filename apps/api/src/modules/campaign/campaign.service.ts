import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import {
  SMS_DEMO_NUMBERS_GROUP,
  StubNotificationProvider,
  invalidateSmsAllowlist,
} from '../../notifications/notification.provider';
import {
  AudienceQueryDto,
  CreateCampaignDto,
  DemoNumberDto,
  ExtraRecipientInput,
  StaffQueryDto,
  UpdateCampaignDto,
} from './dto/create-campaign.dto';

const NAME_TOKEN = '{고객명}';
const DEFAULT_OPT_OUT = '무료수신거부 080-000-0000';
/** 예약 캠페인을 확인하는 주기 */
const SCHEDULE_TICK_MS = 30_000;
/** 알림톡은 카카오 채널·템플릿 연동 전 — 저장·발송을 막는다 */
export const ALIMTALK_NOT_READY = '아직 알림톡 연결이 안되었습니다.';

const digitsOf = (s: string) => s.replace(/\D/g, '');
/** 숫자만 → 010-1234-5678 꼴(저장·표시용) */
const formatPhone = (raw: string) => {
  const d = digitsOf(raw);
  if (d.startsWith('02')) {
    return d.length === 9
      ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
      : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
};

/** 받는 사람 바꾸기 — 안 넘긴 종류(undefined)는 그대로 둔다 */
interface RecipientInput {
  customerIds?: string[];
  employeeIds?: string[];
  extraRecipients?: ExtraRecipientInput[];
}

/**
 * MKT-01: 캠페인 — 고객을 조건으로 찾아 골라서(개별 선택) 문자·알림톡을 보낸다.
 * 받는 사람은 고를 때 원장에서 이름·번호를 꺼내 남기고(campaign_recipient), 건별 결과를 기록한다.
 * 발송은 요청과 따로 돈다(대상이 많아도 화면이 기다리지 않게) — 화면은 상세를 다시 읽어 진행을 본다.
 */
@Injectable()
export class CampaignService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Campaign');
  private timer: NodeJS.Timeout | null = null;
  private readonly dispatching = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly provider: StubNotificationProvider,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDue(), SCHEDULE_TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── 조회 ──

  findAll() {
    return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async findOne(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`캠페인을 찾을 수 없습니다: ${id}`);
    return c;
  }

  /** 상세 — 캠페인 + 받는 사람(건별 결과) */
  async detail(id: string) {
    const c = await this.findOne(id);
    const rows = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      orderBy: { name: 'asc' },
      include: { employee: { select: { orgUnit: { select: { name: true } } } } },
    });
    const recipients = rows.map(({ employee, ...r }) => ({
      ...r,
      kind: r.customerId ? 'CUSTOMER' : r.employeeId ? 'EMPLOYEE' : 'EXTRA',
      orgUnit: employee?.orgUnit.name ?? null,
    }));
    return { ...c, recipients };
  }

  /** 대상 수 미리보기 */
  async previewCount(id: string) {
    const c = await this.findOne(id);
    if (c.targetGrade && !c.recipientCount) {
      const count = await this.prisma.customer.count({
        where: { phonePrimary: { not: null }, grade: c.targetGrade },
      });
      return { count };
    }
    return { count: await this.prisma.campaignRecipient.count({ where: { campaignId: id } }) };
  }

  // ── 받을 고객 찾기 ──

  private async audienceWhere(
    q: AudienceQueryDto,
    principal: AuthPrincipal,
  ): Promise<Prisma.CustomerWhereInput> {
    const and: Prisma.CustomerWhereInput[] = [{ phonePrimary: { not: null } }];
    const ids = await this.scope.orgScopeIds(principal);
    if (ids !== null) {
      and.push({
        OR: [{ ownerOrgId: { in: ids } }, { leads: { some: { orgUnitId: { in: ids } } } }],
      });
    }
    if (q.ids) and.push({ id: { in: q.ids } });
    const kw = q.keyword?.trim();
    if (kw) {
      // 전화번호는 하이픈 유무와 상관없이 숫자만 비교한다(저장은 010-1234-5678 꼴)
      const digits = kw.replace(/\D/g, '');
      const byPhone =
        digits.length >= 3
          ? (
              await this.prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM customer
                WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
                LIMIT 5000`
            ).map((r) => r.id)
          : [];
      and.push({
        OR: [{ name: { contains: kw } }, ...(byPhone.length ? [{ id: { in: byPhone } }] : [])],
      });
    }
    if (q.grades?.length) and.push({ grade: { in: q.grades } });
    if (q.sido?.length) {
      and.push({
        OR: [
          { sido: { in: q.sido } },
          { leads: { some: { fromSido: { in: q.sido } } } },
          { leads: { some: { toSido: { in: q.sido } } } },
        ],
      });
    }
    const addr = q.addressKeyword?.trim();
    if (addr) {
      and.push({
        OR: [
          { addr: { contains: addr } },
          { leads: { some: { fromAddr: { contains: addr } } } },
          { leads: { some: { toAddr: { contains: addr } } } },
        ],
      });
    }
    // 접수 조건은 한 접수에 함께 걸리게 묶는다(“다음 주 이사 + 계약 전” = 같은 접수)
    const lead: Prisma.LeadWhereInput = {};
    if (q.moveDateFrom || q.moveDateTo) {
      lead.moveDate = {
        ...(q.moveDateFrom ? { gte: new Date(q.moveDateFrom.slice(0, 10)) } : {}),
        ...(q.moveDateTo ? { lte: new Date(q.moveDateTo.slice(0, 10)) } : {}),
      };
    }
    if (q.receivedFrom || q.receivedTo) {
      lead.createdAt = {
        ...(q.receivedFrom
          ? { gte: new Date(`${q.receivedFrom.slice(0, 10)}T00:00:00+09:00`) }
          : {}),
        ...(q.receivedTo
          ? { lte: new Date(`${q.receivedTo.slice(0, 10)}T23:59:59.999+09:00`) }
          : {}),
      };
    }
    if (q.leadStatuses?.length) lead.status = { in: q.leadStatuses };
    if (q.orgUnitId) lead.orgUnitId = q.orgUnitId;
    if (Object.keys(lead).length) and.push({ leads: { some: lead } });

    if (q.excludeRecentDays && q.excludeRecentDays > 0) {
      const since = new Date(Date.now() - q.excludeRecentDays * 86_400_000);
      const recent = await this.prisma.campaignRecipient.findMany({
        where: { status: 'SENT', sentAt: { gte: since }, customerId: { not: null } },
        select: { customerId: true },
        distinct: ['customerId'],
      });
      const recentIds = recent.map((r) => r.customerId).filter((x): x is string => !!x);
      if (recentIds.length) and.push({ id: { notIn: recentIds } });
    }
    return { AND: and };
  }

  /** 조건에 맞는 고객(페이지) — 최근 접수 한 건을 같이 보여 준다 */
  async searchAudience(q: AudienceQueryDto, principal: AuthPrincipal) {
    const where = await this.audienceWhere(q, principal);
    const pageSize = Math.min(q.pageSize ?? 50, 200);
    const page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phonePrimary: true,
          grade: true,
          addr: true,
          sido: true,
          sigungu: true,
          ownerOrg: { select: { name: true } },
          leads: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              leadNo: true,
              status: true,
              moveDate: true,
              fromAddr: true,
              toAddr: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((c) => {
        const l = c.leads[0];
        return {
          id: c.id,
          name: c.name,
          phone: c.phonePrimary,
          grade: c.grade,
          addr: c.addr ?? l?.toAddr ?? l?.fromAddr ?? null,
          orgUnit: c.ownerOrg?.name ?? null,
          lead: l
            ? {
                leadNo: l.leadNo,
                status: l.status,
                moveDate: l.moveDate ? l.moveDate.toISOString().slice(0, 10) : null,
                receivedAt: l.createdAt.toISOString().slice(0, 10),
              }
            : null,
        };
      }),
    };
  }

  /** 조건에 맞는 고객 전체 id — '검색 결과 전체 선택'용 */
  async audienceIds(q: AudienceQueryDto, principal: AuthPrincipal) {
    const where = await this.audienceWhere(q, principal);
    const rows = await this.prisma.customer.findMany({
      where,
      select: { id: true },
      take: 20000,
    });
    return { ids: rows.map((r) => r.id) };
  }

  // ── 작성 ──

  async create(dto: CreateCampaignDto, principal: AuthPrincipal) {
    this.validate(dto);
    const c = await this.prisma.campaign.create({
      data: {
        ...this.fields(dto),
        name: dto.name.trim(),
        message: dto.message,
        createdBy: principal.userId,
      },
    });
    await this.setRecipients(c.id, dto, principal);
    return this.detail(c.id);
  }

  async update(id: string, dto: UpdateCampaignDto, principal: AuthPrincipal) {
    const c = await this.findOne(id);
    if (c.status !== 'DRAFT') throw new BadRequestException('작성 중인 캠페인만 고칠 수 있습니다.');
    this.validate({ ...c, ...dto } as CreateCampaignDto);
    await this.prisma.campaign.update({ where: { id }, data: this.fields(dto) });
    await this.setRecipients(id, dto, principal);
    return this.detail(id);
  }

  /**
   * 삭제 — 받는 사람 목록도 같이 지운다(발송 이력인 notification 로그는 남긴다).
   * 지금 보내는 중(SENDING)이면 막는다. 예약(SCHEDULED)은 지우면 예약도 함께 사라진다.
   */
  async remove(id: string) {
    const c = await this.findOne(id);
    if (c.status === 'SENDING' || this.dispatching.has(id)) {
      throw new ConflictException(
        '발송 중인 캠페인은 삭제할 수 없습니다. 발송이 끝난 뒤 삭제하세요.',
      );
    }
    // 확인과 삭제 사이에 예약 발송이 시작되면 되돌린다 — 상태 조건을 걸고 한 트랜잭션에서 지운다
    await this.prisma.$transaction(async (tx) => {
      await tx.campaignRecipient.deleteMany({ where: { campaignId: id } });
      const del = await tx.campaign.deleteMany({ where: { id, status: { not: 'SENDING' } } });
      if (!del.count) {
        throw new ConflictException(
          '발송 중인 캠페인은 삭제할 수 없습니다. 발송이 끝난 뒤 삭제하세요.',
        );
      }
    });
  }

  private fields(dto: UpdateCampaignDto) {
    return {
      name: dto.name?.trim(),
      channel: dto.channel,
      periodStart:
        dto.periodStart === undefined
          ? undefined
          : dto.periodStart
            ? new Date(dto.periodStart)
            : null,
      periodEnd:
        dto.periodEnd === undefined ? undefined : dto.periodEnd ? new Date(dto.periodEnd) : null,
      message: dto.message,
      title: dto.title === undefined ? undefined : dto.title.trim() || null,
      isAd: dto.isAd,
      optOutText: dto.optOutText === undefined ? undefined : dto.optOutText.trim() || null,
      templateCode: dto.templateCode === undefined ? undefined : dto.templateCode.trim() || null,
      buttons:
        dto.buttons === undefined
          ? undefined
          : dto.buttons.length
            ? (dto.buttons as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
      fallbackSms: dto.fallbackSms,
      filters: dto.filters === undefined ? undefined : (dto.filters as Prisma.InputJsonValue),
      targetGrade: dto.targetGrade,
      scheduledAt:
        dto.scheduledAt === undefined
          ? undefined
          : dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null,
    };
  }

  private validate(dto: CreateCampaignDto) {
    if (dto.channel === 'ALIMTALK') throw new BadRequestException(ALIMTALK_NOT_READY);
    if (!dto.message?.trim()) throw new BadRequestException('본문을 입력하세요.');
    const start = dto.periodStart ? new Date(dto.periodStart).getTime() : null;
    const end = dto.periodEnd ? new Date(dto.periodEnd).getTime() : null;
    if (start !== null && end !== null && end < start) {
      throw new BadRequestException('캠페인 기간의 끝 날짜가 시작 날짜보다 빠릅니다.');
    }
  }

  /**
   * 받는 사람을 이 목록으로 바꾼다 — 고객(범위 안·번호 있는 고객), 직원(재직·번호 있는 직원),
   * 직접 입력(시연 번호). 이름·번호는 담을 때 원장에서 꺼내 남긴다. 직원·직접 입력은 같은 번호면 한 번만.
   * 아무 종류도 넘기지 않으면 그대로 두고, 넘기지 않은 종류는 지금 담긴 그대로 둔다.
   */
  private async setRecipients(id: string, input: RecipientInput, principal: AuthPrincipal) {
    const { customerIds, employeeIds, extraRecipients } = input;
    if (!customerIds && !employeeIds && !extraRecipients) return;
    const existing =
      !customerIds || !employeeIds || !extraRecipients
        ? await this.prisma.campaignRecipient.findMany({ where: { campaignId: id } })
        : [];
    const scope = await this.scope.orgScopeIds(principal);

    const cIds = [
      ...new Set(customerIds ?? existing.map((r) => r.customerId).filter((x): x is string => !!x)),
    ];
    const customers = cIds.length
      ? await this.prisma.customer.findMany({
          where: {
            id: { in: cIds },
            phonePrimary: { not: null },
            ...(scope === null
              ? {}
              : {
                  OR: [
                    { ownerOrgId: { in: scope } },
                    { leads: { some: { orgUnitId: { in: scope } } } },
                  ],
                }),
          },
          select: { id: true, name: true, phonePrimary: true },
        })
      : [];

    const eIds = [
      ...new Set(employeeIds ?? existing.map((r) => r.employeeId).filter((x): x is string => !!x)),
    ];
    const employees = eIds.length
      ? await this.prisma.employee.findMany({
          where: {
            id: { in: eIds },
            isActive: true,
            phone: { not: null },
            ...(scope === null ? {} : { orgUnitId: { in: scope } }),
          },
          select: { id: true, name: true, phone: true },
        })
      : [];

    const extras =
      extraRecipients ??
      existing
        .filter((r) => !r.customerId && !r.employeeId)
        .map((r) => ({ name: r.name, phone: r.phone }));

    // 고객은 고객마다 한 줄(시드의 가짜 번호는 겹칠 수 있다). 직원·직접 입력은 이미 담긴 번호면 뺀다
    const seen = new Set(customers.map((c) => digitsOf(c.phonePrimary!)));
    const data: Prisma.CampaignRecipientCreateManyInput[] = customers.map((c) => ({
      campaignId: id,
      customerId: c.id,
      name: c.name,
      phone: c.phonePrimary!,
    }));
    for (const e of employees) {
      const d = digitsOf(e.phone!);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      data.push({ campaignId: id, employeeId: e.id, name: e.name, phone: e.phone! });
    }
    for (const x of extras) {
      const d = digitsOf(x.phone);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      data.push({ campaignId: id, name: x.name.trim() || formatPhone(d), phone: formatPhone(d) });
    }

    await this.prisma.$transaction([
      this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaignRecipient.createMany({ data }),
      this.prisma.campaign.update({
        where: { id },
        data: { recipientCount: data.length },
      }),
    ]);
  }

  // ── 직원·시연 번호(시연 발송용 받는 사람) ──

  /** 받을 직원 찾기 — 재직 중·번호 있는 직원. 전화번호는 하이픈과 상관없이 숫자로 비교 */
  async searchStaff(q: StaffQueryDto, principal: AuthPrincipal) {
    const and: Prisma.EmployeeWhereInput[] = [{ isActive: true }, { phone: { not: null } }];
    const scope = await this.scope.orgScopeIds(principal);
    if (scope !== null) and.push({ orgUnitId: { in: scope } });
    const kw = q.keyword?.trim();
    if (kw) {
      const d = digitsOf(kw);
      const byPhone =
        d.length >= 3
          ? (
              await this.prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM employee
                WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE ${'%' + d + '%'}
                LIMIT 2000`
            ).map((r) => r.id)
          : [];
      and.push({
        OR: [{ name: { contains: kw } }, ...(byPhone.length ? [{ id: { in: byPhone } }] : [])],
      });
    }
    const where: Prisma.EmployeeWhereInput = { AND: and };
    const pageSize = Math.min(q.pageSize ?? 20, 100);
    const page = q.page ?? 1;
    const [total, rows, allowed] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        orderBy: [{ orgUnit: { name: 'asc' } }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          orgUnit: { select: { name: true } },
          appUsers: {
            where: { isActive: true },
            select: { userRoles: { select: { role: { select: { name: true } } } } },
          },
        },
      }),
      this.provider.allowedNumbers(),
    ]);
    return {
      total,
      page,
      pageSize,
      /** 지금 허용 번호로만 보내는 중인지(시연 안전장치) */
      restricted: allowed !== null,
      rows: rows.map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        orgUnit: e.orgUnit.name,
        role:
          [...new Set(e.appUsers.flatMap((u) => u.userRoles.map((r) => r.role.name)))].join(', ') ||
          null,
        /** 이 번호로 실제 문자가 나가는지 */
        allowed: allowed === null || allowed.has(digitsOf(e.phone ?? '')),
      })),
    };
  }

  /** 시연 번호 목록(공통코드 SMS_DEMO_NUMBERS) — 문자 허용 번호에 들어간다 */
  async demoNumbers() {
    const rows = await this.prisma.commonCode.findMany({
      where: { codeGroup: SMS_DEMO_NUMBERS_GROUP, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { code: true, name: true },
    });
    return rows.map((r) => ({ code: r.code, name: r.name, phone: formatPhone(r.code) }));
  }

  /** 시연 번호 등록 — 이미 있는 번호면 이름만 바꾼다 */
  async addDemoNumber(dto: DemoNumberDto) {
    const code = digitsOf(dto.phone);
    const name = dto.name.trim() || formatPhone(code);
    await this.prisma.commonCode.upsert({
      where: { codeGroup_code: { codeGroup: SMS_DEMO_NUMBERS_GROUP, code } },
      create: { codeGroup: SMS_DEMO_NUMBERS_GROUP, code, name },
      update: { name, isActive: true },
    });
    invalidateSmsAllowlist();
    return { code, name, phone: formatPhone(code) };
  }

  /** 시연 번호 삭제 — 허용 번호에서도 빠진다 */
  async removeDemoNumber(phone: string) {
    const code = digitsOf(phone);
    const del = await this.prisma.commonCode.deleteMany({
      where: { codeGroup: SMS_DEMO_NUMBERS_GROUP, code },
    });
    if (!del.count) throw new NotFoundException('등록된 시연 번호가 아닙니다.');
    invalidateSmsAllowlist();
  }

  // ── 발송 ──

  /**
   * 발송 — 예약 시각이 미래면 예약만 걸고, 아니면 바로 보낸다(백그라운드).
   * 예전 방식(등급 일괄) 캠페인은 받는 사람이 없으면 그 등급 고객으로 채운다(등급이 없으면 채우지 않는다 —
   * 전체 고객에게 잘못 나가는 일을 막는다).
   */
  async send(id: string, principal: AuthPrincipal) {
    const c = await this.findOne(id);
    if (c.status !== 'DRAFT') throw new BadRequestException('작성 중인 캠페인만 보낼 수 있습니다.');
    if (c.channel === 'ALIMTALK') throw new BadRequestException(ALIMTALK_NOT_READY);
    let count = await this.prisma.campaignRecipient.count({ where: { campaignId: id } });
    if (!count && c.targetGrade) {
      const customers = await this.prisma.customer.findMany({
        where: { phonePrimary: { not: null }, grade: c.targetGrade },
        select: { id: true },
      });
      await this.setRecipients(id, { customerIds: customers.map((x) => x.id) }, principal);
      count = await this.prisma.campaignRecipient.count({ where: { campaignId: id } });
    }
    if (!count) throw new BadRequestException('받는 사람이 없습니다.');

    if (c.scheduledAt && c.scheduledAt.getTime() > Date.now() + 30_000) {
      await this.prisma.campaign.update({ where: { id }, data: { status: 'SCHEDULED' } });
      return this.detail(id);
    }
    await this.prisma.campaign.update({ where: { id }, data: { status: 'SENDING' } });
    void this.dispatch(id);
    return this.detail(id);
  }

  /** 예약 취소 — 다시 작성 중으로 */
  async cancel(id: string) {
    const c = await this.findOne(id);
    if (c.status !== 'SCHEDULED')
      throw new BadRequestException('예약된 캠페인만 취소할 수 있습니다.');
    await this.prisma.campaign.update({ where: { id }, data: { status: 'DRAFT' } });
    return this.detail(id);
  }

  private async runDue() {
    try {
      const due = await this.prisma.campaign.findMany({
        where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
        select: { id: true },
      });
      for (const d of due) {
        // 그 사이 삭제·취소된 캠페인은 건너뛴다(상태가 그대로 SCHEDULED일 때만 발송으로 넘긴다)
        const claimed = await this.prisma.campaign.updateMany({
          where: { id: d.id, status: 'SCHEDULED' },
          data: { status: 'SENDING' },
        });
        if (claimed.count) void this.dispatch(d.id);
      }
    } catch (e) {
      this.logger.warn(`예약 확인 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 받는 사람마다 본문을 만들어 보내고 결과를 남긴다. 아직 안 보낸(PENDING) 사람만 — 중간에 멈춰도 이어서 보낼 수 있다 */
  private async dispatch(id: string) {
    if (this.dispatching.has(id)) return;
    this.dispatching.add(id);
    try {
      const c = await this.findOne(id);
      const pending = await this.prisma.campaignRecipient.findMany({
        where: { campaignId: id, status: 'PENDING' },
      });
      for (const r of pending) {
        const text = this.compose(c, r.name);
        const title = c.title ?? undefined;
        let res = await this.provider.send(c.channel, r.phone, text, { title });
        // 알림톡이 안 되면(카톡 미사용자 등) 문자로 대체
        if (!res.ok && c.channel === 'ALIMTALK' && c.fallbackSms) {
          res = await this.provider.send('SMS', r.phone, text, { title });
        }
        await this.prisma.campaignRecipient.update({
          where: { id: r.id },
          data: {
            status: res.ok ? 'SENT' : 'FAILED',
            reason: res.ok ? null : (res.reason ?? '발송 실패'),
            sentAt: new Date(),
          },
        });
        await this.prisma.notification.create({
          data: {
            channel: c.channel,
            eventType: 'campaign',
            recipient: r.phone,
            message: text,
            status: res.ok ? 'SENT' : 'FAILED',
            payload: {
              campaignId: c.id,
              customerId: r.customerId,
              employeeId: r.employeeId,
              ...(res.reason ? { reason: res.reason } : {}),
            },
          },
        });
      }
      const [sent, failed] = await Promise.all([
        this.prisma.campaignRecipient.count({ where: { campaignId: id, status: 'SENT' } }),
        this.prisma.campaignRecipient.count({ where: { campaignId: id, status: 'FAILED' } }),
      ]);
      await this.prisma.campaign.update({
        where: { id },
        data: { status: 'SENT', sentCount: sent, failedCount: failed, sentAt: new Date() },
      });
    } catch (e) {
      this.logger.error(`캠페인 ${id} 발송 중 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.dispatching.delete(id);
    }
  }

  /** 받는 사람 한 명의 본문 — 이름 넣기, 광고 표기(문자) */
  private compose(
    c: { channel: string; message: string; isAd: boolean; optOutText: string | null },
    name: string,
  ) {
    let text = c.message.split(NAME_TOKEN).join(name);
    if (c.isAd && c.channel === 'SMS') {
      text = `(광고)${text}\n${c.optOutText ?? DEFAULT_OPT_OUT}`;
    }
    return text;
  }
}
