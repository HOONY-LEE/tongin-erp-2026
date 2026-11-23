import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  normalizeStudioSpec,
  type AuthPrincipal,
  type CustomWidgetRow,
  type StudioParams,
  type StudioSpec,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { StudioQueryService } from './studio-query.service';
import { WidgetStudioAiService } from './widget-studio-ai.service';

class SaveDto {
  @IsObject()
  spec!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;
}
class PatchDto {
  @IsOptional()
  @IsObject()
  spec?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;
}
class PreviewDto {
  @IsObject()
  spec!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
class DataDto {
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
class ProposeDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsObject()
  current?: Record<string, unknown>;
}

/** 조작 값 — 아는 칸만(값 검사는 실행기가 카탈로그로) */
function toParams(raw?: Record<string, unknown>): StudioParams {
  const r = raw ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const filters: Record<string, string[]> = {};
  if (r.filters && typeof r.filters === 'object')
    for (const [k, v] of Object.entries(r.filters as Record<string, unknown>))
      if (Array.isArray(v)) filters[k] = v.map(String).slice(0, 50);
  return {
    ...(str(r.grain) ? { grain: str(r.grain) as StudioParams['grain'] } : {}),
    ...(r.dimension === null || str(r.dimension)
      ? { dimension: (r.dimension as string | null) ?? null }
      : {}),
    ...(str(r.measure) ? { measure: str(r.measure) } : {}),
    ...(str(r.period) ? { period: str(r.period) as StudioParams['period'] } : {}),
    ...(str(r.viz) ? { viz: str(r.viz) as StudioParams['viz'] } : {}),
    ...(str(r.field) ? { field: str(r.field) } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

/**
 * 위젯 스튜디오 — 만든 위젯(설계서) 저장·목록, 미리보기, AI 제안.
 * 만들기·고치기는 대시보드 관리 권한. 위젯 데이터(/:id/data)는 대시보드를 보는 누구나 —
 * 그 데이터의 읽기 권한과 지점 범위는 실행기가 확인한다.
 */
@Controller('custom-widgets')
export class CustomWidgetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: StudioQueryService,
    private readonly ai: WidgetStudioAiService,
  ) {}

  private async view(id: string): Promise<CustomWidgetRow> {
    const r = await this.prisma.customWidget.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('위젯을 찾을 수 없습니다.');
    return (await this.rows([r]))[0];
  }

  private async rows(
    list: {
      id: string;
      title: string;
      subtitle: string | null;
      spec: unknown;
      prompt: string | null;
      createdBy: string | null;
      updatedAt: Date;
    }[],
  ): Promise<CustomWidgetRow[]> {
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: list.map((r) => r.createdBy).filter((x): x is string => !!x) } },
      select: { id: true, loginId: true, employee: { select: { name: true } } },
    });
    const name = new Map(users.map((u) => [u.id, u.employee?.name ?? u.loginId]));
    return list.map((r) => ({
      id: r.id,
      key: `cw:${r.id}`,
      title: r.title,
      subtitle: r.subtitle,
      spec: normalizeStudioSpec(r.spec).spec,
      prompt: r.prompt,
      createdByName: r.createdBy ? (name.get(r.createdBy) ?? null) : null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  @Get()
  @RequirePermissions('DASHBOARD.READ')
  async list() {
    return this.rows(await this.prisma.customWidget.findMany({ orderBy: { updatedAt: 'desc' } }));
  }

  /** 내 대시보드에 놓을 수 있는 만든 위젯 — 그 데이터를 볼 수 있는 것만(대시보드 관리 권한 없이도) */
  @Get('available')
  async available(@CurrentUser() user: AuthPrincipal) {
    const all = await this.rows(
      await this.prisma.customWidget.findMany({ orderBy: { title: 'asc' } }),
    );
    return all.filter((w) => this.query.canSee(w.spec, user));
  }

  @Get(':id')
  @RequirePermissions('DASHBOARD.READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.view(id);
  }

  @Post()
  @RequirePermissions('DASHBOARD.CREATE')
  async create(@CurrentUser() user: AuthPrincipal, @Body() dto: SaveDto) {
    const { spec } = normalizeStudioSpec(dto.spec);
    const r = await this.prisma.customWidget.create({
      data: {
        title: spec.title,
        subtitle: spec.subtitle ?? null,
        spec: spec as object,
        prompt: dto.prompt?.trim() || null,
        createdBy: user.userId,
      },
    });
    return this.view(r.id);
  }

  @Patch(':id')
  @RequirePermissions('DASHBOARD.UPDATE')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchDto) {
    await this.view(id);
    const spec = dto.spec ? normalizeStudioSpec(dto.spec).spec : null;
    await this.prisma.customWidget.update({
      where: { id },
      data: {
        ...(spec
          ? { title: spec.title, subtitle: spec.subtitle ?? null, spec: spec as object }
          : {}),
        ...(dto.prompt !== undefined ? { prompt: dto.prompt.trim() || null } : {}),
      },
    });
    return this.view(id);
  }

  /** 지운 위젯은 대시보드 배치에서 저절로 빠진다(보여 줄 때 없는 위젯은 거른다) */
  @Delete(':id')
  @RequirePermissions('DASHBOARD.DELETE')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.view(id);
    await this.prisma.customWidget.delete({ where: { id } });
    return { ok: true };
  }

  /** 스튜디오 미리보기 — 저장 전 설계서로 바로 */
  @Post('preview')
  @RequirePermissions('DASHBOARD.READ')
  preview(@CurrentUser() user: AuthPrincipal, @Body() dto: PreviewDto) {
    return this.query.run(dto.spec, toParams(dto.params), user);
  }

  /** 자연어 → 위젯 제안(AI) */
  @Post('propose')
  @RequirePermissions('DASHBOARD.CREATE')
  propose(@Body() dto: ProposeDto) {
    return this.ai.propose(
      dto.prompt,
      dto.current ? (normalizeStudioSpec(dto.current).spec as StudioSpec) : null,
    );
  }

  /** 대시보드에서 위젯 하나 — 설계서 + 데이터(보는 사람 권한·범위로) */
  @Post(':id/data')
  async data(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DataDto,
  ) {
    const w = await this.view(id);
    if (!this.query.canSee(w.spec, user))
      throw new ForbiddenException('이 위젯의 데이터를 볼 권한이 없습니다.');
    return { widget: w, ...(await this.query.run(w.spec, toParams(dto.params), user)) };
  }
}
