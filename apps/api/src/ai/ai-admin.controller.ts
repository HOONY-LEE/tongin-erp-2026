import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import {
  AI_ACCESS,
  AI_FEATURES,
  PERMISSION_WILDCARD,
  aiBilledTokens,
  aiCost,
  type AiPrices,
  type AuthPrincipal,
} from '@tongin/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrincipalCache } from '../auth/principal-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  allowedModels,
  catalogIsLive,
  defaultModel,
  isChatModel,
  isKnownModel,
  modelCatalog,
} from './ai-models';
import { AiUsageService, kstMonthStart } from './ai-usage.service';

/** 모델 id 개수 상한 — 목록은 Claude에서 받아 오므로 값 검사는 처리에서(isKnownModel) */
const MODELS_MAX = 100;
/** 월 한도 최댓값(토큰) — 20억(정수 칸 한계 안) */
const LIMIT_MAX = 2_000_000_000;
/** 사용 기록 한 번에 보내는 최대 줄 수 */
const USAGE_ROWS_MAX = 2000;

class SaveSettingDto {
  @IsArray()
  @ArrayMaxSize(MODELS_MAX)
  @IsString({ each: true })
  allowed!: string[];

  @IsString()
  defaultModel!: string;

  /** { 모델 id: { input, output } } 달러 / 100만 토큰 */
  @IsObject()
  prices!: Record<string, { input?: unknown; output?: unknown }>;

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(LIMIT_MAX)
  monthlyTokenLimit!: number | null;
}

class SavePolicyDto {
  @IsIn(Object.keys(AI_ACCESS))
  access!: keyof typeof AI_ACCESS;

  @IsOptional()
  @IsIn(Object.keys(AI_ACCESS))
  builderAccess?: keyof typeof AI_ACCESS;

  @IsArray()
  @ArrayMaxSize(MODELS_MAX)
  @IsString({ each: true })
  models!: string[];

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(LIMIT_MAX)
  monthlyTokenLimit!: number | null;
}

/** 사용자 권한 표에서 체크한 것 — 켠/끈 결과만 보낸다(그룹과 같으면 서버가 '그룹 따름'으로 되돌림) */
class AccessChangeDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  use?: boolean;

  @IsOptional()
  @IsBoolean()
  builder?: boolean;
}
class AccessBatchDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AccessChangeDto)
  changes!: AccessChangeDto[];
}

class UsageQuery {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(Object.keys(AI_FEATURES))
  feature?: string;
}

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** 'YYYY-MM-DD'(한국 날짜) 0시 */
const kstDay = (s: string, plusDays = 0) =>
  new Date(Date.parse(`${s}T00:00:00+09:00`) + plusDays * 24 * 3600_000);

/** 'YYYY-MM' → 그달 시작·끝(한국 시간). 없으면 이번 달 */
function monthRange(month?: string): [Date, Date] {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00+09:00`);
    return [start, kstMonthStart(start, 1)];
  }
  return [kstMonthStart(), kstMonthStart(new Date(), 1)];
}

function cleanPrices(raw: SaveSettingDto['prices']): AiPrices {
  const out: AiPrices = {};
  for (const [id, p] of Object.entries(raw ?? {})) {
    if (!isKnownModel(id)) continue;
    const input = Number(p?.input);
    const output = Number(p?.output);
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;
    if (input > 1000 || output > 1000)
      throw new BadRequestException('단가는 100만 토큰당 1,000달러 이하로 넣어 주세요.');
    out[id] = { input, output };
  }
  return out;
}

/**
 * AI 관리 — 회사 AI 설정(모델·단가·기본 한도), 사용자별 권한·한도, 사용량·사용 기록.
 * 권한: AI.ADMIN
 */
@Controller('ai-admin')
@RequirePermissions('AI.ADMIN')
export class AiAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageService,
    private readonly principals: PrincipalCache,
  ) {}

  @Get('settings')
  async settings() {
    const s = await this.usage.getSetting();
    return {
      configured: !!process.env.ANTHROPIC_API_KEY,
      models: modelCatalog(),
      // 목록을 Claude에서 받아 왔는지·언제 — 못 받았으면 코드의 기본 목록
      catalog: { live: catalogIsLive(), fetchedAt: this.usage.catalogFetchedAt },
      setting: {
        allowed: s?.allowed ?? allowedModels(),
        defaultModel: s?.defaultModel ?? defaultModel(),
        prices: s?.prices ?? {},
        monthlyTokenLimit: s?.monthlyTokenLimit ?? null,
        updatedAt: s?.updatedAt ?? null,
      },
    };
  }

  @Put('settings')
  async saveSettings(@CurrentUser() user: AuthPrincipal, @Body() dto: SaveSettingDto) {
    const allowed = [...new Set(dto.allowed)].filter(isKnownModel);
    if (!allowed.length) throw new BadRequestException('모델을 하나 이상 열어 두어야 합니다.');
    if (!allowed.includes(dto.defaultModel))
      throw new BadRequestException('기본 모델은 열어 둔 모델 중에서 골라 주세요.');
    if (!isChatModel(dto.defaultModel))
      throw new BadRequestException('기본 모델은 대화에 쓸 수 있는 모델이어야 합니다.');
    await this.usage.saveSetting(
      {
        allowed,
        defaultModel: dto.defaultModel,
        prices: cleanPrices(dto.prices),
        monthlyTokenLimit: dto.monthlyTokenLimit,
      },
      user.userId,
    );
    return this.settings();
  }

  /** Claude에서 모델 목록 새로 받기 */
  @Post('models/refresh')
  async refreshModels() {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new ServiceUnavailableException(
        '서버에 Claude API 키가 없어 모델 목록을 받을 수 없습니다.',
      );
    try {
      await this.usage.refreshCatalog();
    } catch (e) {
      throw new ServiceUnavailableException(
        `Claude에서 모델 목록을 받지 못했습니다: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return this.settings();
  }

  /** 사용자별 권한·한도와 그달 사용량 — 사람 계정(에이전트 계정 제외) */
  @Get('users')
  async users(@Query('month') month?: string) {
    const [from, to] = monthRange(month);
    const [users, policies, sums, setting] = await Promise.all([
      this.prisma.appUser.findMany({
        where: { principalType: 'HUMAN' },
        select: {
          id: true,
          loginId: true,
          isActive: true,
          isExternal: true,
          employee: {
            select: {
              name: true,
              isActive: true,
              orgUnit: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
          userRoles: {
            select: {
              role: {
                select: { rolePerms: { select: { permission: { select: { code: true } } } } },
              },
            },
          },
        },
        orderBy: { loginId: 'asc' },
      }),
      this.prisma.aiUserPolicy.findMany(),
      this.prisma.aiUsageLog.groupBy({
        by: ['userId', 'model'],
        where: { createdAt: { gte: from, lt: to } },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          cacheWriteTokens: true,
        },
      }),
      this.usage.getSetting(),
    ]);
    const prices = setting?.prices ?? {};
    const byPolicy = new Map(policies.map((p) => [p.userId, p]));
    const byUser = new Map<string, { calls: number; tokens: number; cost: number | null }>();
    for (const g of sums) {
      if (!g.userId) continue;
      const u = {
        inputTokens: g._sum.inputTokens ?? 0,
        outputTokens: g._sum.outputTokens ?? 0,
        cacheReadTokens: g._sum.cacheReadTokens ?? 0,
        cacheWriteTokens: g._sum.cacheWriteTokens ?? 0,
      };
      const cur = byUser.get(g.userId) ?? { calls: 0, tokens: 0, cost: null as number | null };
      const c = aiCost(prices, g.model, u);
      byUser.set(g.userId, {
        calls: cur.calls + g._count._all,
        tokens: cur.tokens + aiBilledTokens(u),
        cost: c == null ? cur.cost : (cur.cost ?? 0) + c,
      });
    }
    return users.map((u) => {
      const perms = new Set(
        u.userRoles.flatMap((r) => r.role.rolePerms.map((rp) => rp.permission.code)),
      );
      const all = perms.has(PERMISSION_WILDCARD);
      const roleAllows = all || perms.has('AI.USE');
      const roleAllowsBuilder = all || perms.has('AI.MANAGE');
      const p = byPolicy.get(u.id);
      const access = (p?.access ?? 'DEFAULT') as keyof typeof AI_ACCESS;
      const builderAccess = (p?.builderAccess ?? 'DEFAULT') as keyof typeof AI_ACCESS;
      const used = byUser.get(u.id);
      return {
        userId: u.id,
        loginId: u.loginId,
        name: u.employee?.name ?? null,
        orgUnitName: u.employee?.orgUnit?.name ?? null,
        positionName: u.employee?.position?.name ?? null,
        active: u.isActive && u.employee?.isActive !== false,
        isExternal: u.isExternal,
        roleAllows,
        access,
        // 전체 권한(*) 계정은 막아도 막히지 않는다(관리자)
        canUse: all || access === 'ALLOW' || (access === 'DEFAULT' && roleAllows),
        roleAllowsBuilder,
        builderAccess,
        canBuild:
          all || builderAccess === 'ALLOW' || (builderAccess === 'DEFAULT' && roleAllowsBuilder),
        superUser: all,
        models: p?.models ?? [],
        monthlyTokenLimit: p?.monthlyTokenLimit ?? null,
        calls: used?.calls ?? 0,
        tokens: used?.tokens ?? 0,
        cost: used ? used.cost : null,
      };
    });
  }

  @Put('users/:userId')
  async savePolicy(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: SavePolicyDto) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('계정을 찾을 수 없습니다.');
    const cur = await this.prisma.aiUserPolicy.findUnique({ where: { userId } });
    const data = {
      access: dto.access,
      builderAccess: dto.builderAccess ?? cur?.builderAccess ?? 'DEFAULT',
      models: [...new Set(dto.models)].filter(isKnownModel),
      monthlyTokenLimit: dto.monthlyTokenLimit,
    };
    await this.writePolicy(userId, data);
    return { ok: true };
  }

  /**
   * 사용자 권한 표의 체크 저장 — 'AI 사용'·'에이전트 빌더'를 켜고 끈 결과.
   * 권한 그룹이 주는 것과 같으면 '그룹 따름'(DEFAULT), 다르면 허용·막음으로 남긴다.
   */
  @Put('users-access')
  async saveAccess(@Body() dto: AccessBatchDto) {
    const ids = [...new Set(dto.changes.map((c) => c.userId))];
    const [users, policies] = await Promise.all([
      this.prisma.appUser.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          userRoles: {
            select: {
              role: {
                select: { rolePerms: { select: { permission: { select: { code: true } } } } },
              },
            },
          },
        },
      }),
      this.prisma.aiUserPolicy.findMany({ where: { userId: { in: ids } } }),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const byPolicy = new Map(policies.map((p) => [p.userId, p]));
    const pick = (want: boolean, roleHas: boolean) =>
      want === roleHas ? 'DEFAULT' : want ? 'ALLOW' : 'BLOCK';
    let saved = 0;
    for (const c of dto.changes) {
      const u = byId.get(c.userId);
      if (!u) continue;
      const perms = new Set(
        u.userRoles.flatMap((r) => r.role.rolePerms.map((rp) => rp.permission.code)),
      );
      const all = perms.has(PERMISSION_WILDCARD);
      const p = byPolicy.get(c.userId);
      await this.writePolicy(c.userId, {
        access:
          c.use === undefined ? (p?.access ?? 'DEFAULT') : pick(c.use, all || perms.has('AI.USE')),
        builderAccess:
          c.builder === undefined
            ? (p?.builderAccess ?? 'DEFAULT')
            : pick(c.builder, all || perms.has('AI.MANAGE')),
        models: p?.models ?? [],
        monthlyTokenLimit: p?.monthlyTokenLimit ?? null,
      });
      saved++;
    }
    return { ok: true, saved };
  }

  private async writePolicy(
    userId: string,
    data: {
      access: string;
      builderAccess: string;
      models: string[];
      monthlyTokenLimit: number | null;
    },
  ) {
    // 모두 기본값이면 줄을 지운다(회사 기본을 따르게)
    if (
      data.access === 'DEFAULT' &&
      data.builderAccess === 'DEFAULT' &&
      !data.models.length &&
      data.monthlyTokenLimit == null
    ) {
      await this.prisma.aiUserPolicy.deleteMany({ where: { userId } });
    } else {
      await this.prisma.aiUserPolicy.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    }
    this.usage.forgetPolicy(userId);
    // 허용·막음은 'AI 비서 사용'·'에이전트 빌더' 권한에 바로 반영된다(메뉴·화면)
    this.principals.invalidateUser(userId);
  }

  /** 그달 요약 — 합계, 모델별, 기능별, 날짜별 */
  @Get('summary')
  async summary(@Query('month') month?: string) {
    const [from, to] = monthRange(month);
    const [rows, setting] = await Promise.all([
      this.prisma.aiUsageLog.groupBy({
        by: ['model', 'feature'],
        where: { createdAt: { gte: from, lt: to } },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          cacheWriteTokens: true,
        },
      }),
      this.usage.getSetting(),
    ]);
    const prices = setting?.prices ?? {};
    const failed = await this.prisma.aiUsageLog.count({
      where: { createdAt: { gte: from, lt: to }, ok: false },
    });
    const users = await this.prisma.aiUsageLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: from, lt: to }, userId: { not: null } },
    });
    const total = { calls: 0, tokens: 0, cost: null as number | null, failed, users: users.length };
    const byModel: Record<string, { calls: number; tokens: number; cost: number | null }> = {};
    const byFeature: Record<string, { calls: number; tokens: number }> = {};
    for (const r of rows) {
      const u = {
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        cacheReadTokens: r._sum.cacheReadTokens ?? 0,
        cacheWriteTokens: r._sum.cacheWriteTokens ?? 0,
      };
      const tokens = aiBilledTokens(u);
      const cost = aiCost(prices, r.model, u);
      total.calls += r._count._all;
      total.tokens += tokens;
      if (cost != null) total.cost = (total.cost ?? 0) + cost;
      const m = (byModel[r.model] ??= { calls: 0, tokens: 0, cost: null });
      m.calls += r._count._all;
      m.tokens += tokens;
      if (cost != null) m.cost = (m.cost ?? 0) + cost;
      const f = (byFeature[r.feature] ??= { calls: 0, tokens: 0 });
      f.calls += r._count._all;
      f.tokens += tokens;
    }
    return { from: from.toISOString(), to: to.toISOString(), total, byModel, byFeature };
  }

  /** 사용 기록 — 기간(기본 최근 7일)·사용자·기능으로 거른다. 최신 2,000줄까지 */
  @Get('usage')
  async usageLog(@Query() q: UsageQuery) {
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const to = isDate(q.to) ? kstDay(q.to!, 1) : kstDay(today, 1);
    const from = isDate(q.from) ? kstDay(q.from!) : new Date(to.getTime() - 7 * 24 * 3600_000);
    const [rows, setting] = await Promise.all([
      this.prisma.aiUsageLog.findMany({
        where: {
          createdAt: { gte: from, lt: to },
          ...(q.userId && /^[0-9a-f-]{36}$/i.test(q.userId) ? { userId: q.userId } : {}),
          ...(q.feature ? { feature: q.feature } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: USAGE_ROWS_MAX,
      }),
      this.usage.getSetting(),
    ]);
    const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, loginId: true, employee: { select: { name: true } } },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
    const prices = setting?.prices ?? {};
    return {
      truncated: rows.length === USAGE_ROWS_MAX,
      rows: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        userName: r.userId ? (nameOf.get(r.userId) ?? '(지운 계정)') : '(자동 실행)',
        tokens: aiBilledTokens(r),
        cost: aiCost(prices, r.model, r),
      })),
    };
  }
}
