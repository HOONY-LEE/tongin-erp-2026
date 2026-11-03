import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DUTY_CYCLES,
  KPI_MAX_METRICS,
  KPI_SCOPES,
  kpiPeriodOf,
  type AuthPrincipal,
  type DutyCycle,
  type KpiScope,
} from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { DutyService } from './duty.service';
import { KpiService } from './kpi.service';

class DutyDto {
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  ownerEmpId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  backupEmpId?: string | null;

  @IsOptional()
  @IsIn(DUTY_CYCLES)
  cycle?: DutyCycle;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  tool?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\//, { message: '링크는 http(s)://로 시작해야 합니다.' })
  linkUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

class MissionDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  mission?: string | null;
}

class KpiMetricDto {
  @IsString()
  @MaxLength(60)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  unit?: string;

  @IsNumber()
  @Min(0)
  target!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  weight!: number;
}

class KpiSaveDto {
  @IsIn(KPI_SCOPES)
  scope!: KpiScope;

  @IsUUID()
  scopeId!: string;

  @Matches(/^\d{4}-Q[1-4]$/)
  period!: string;

  @IsArray()
  @ArrayMaxSize(KPI_MAX_METRICS)
  @ValidateNested({ each: true })
  @Type(() => KpiMetricDto)
  metrics!: KpiMetricDto[];

  @IsOptional()
  @IsObject()
  actuals?: Record<string, number | null>;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

const periodOr = (p?: string) => (p && /^\d{4}-Q[1-4]$/.test(p) ? p : kpiPeriodOf());

/** 업무 분장 — 보기는 누구나, 정하기는 DUTY.MANAGE(서비스에서 확인) */
@Controller('duties')
export class DutyController {
  constructor(private readonly duties: DutyService) {}

  @Get()
  overview(@CurrentUser() u: AuthPrincipal) {
    return this.duties.overview(u);
  }

  @Get('mine')
  mine(@CurrentUser() u: AuthPrincipal) {
    return u.employeeId ? this.duties.list({ ownerOrBackup: u.employeeId }) : [];
  }

  @Get(':id/tasks')
  tasks(@Param('id', ParseUUIDPipe) id: string) {
    return this.duties.tasks(id);
  }

  @Post()
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: DutyDto) {
    return this.duties.create(u, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DutyDto,
  ) {
    return this.duties.update(u, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.duties.remove(u, id);
  }

  @Patch('orgs/:orgId/mission')
  mission(
    @CurrentUser() u: AuthPrincipal,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: MissionDto,
  ) {
    return this.duties.setMission(u, orgId, dto.mission ?? null);
  }
}

/** 성과 평가 — 보기 HR.READ, 지표 구성·실적 입력 HR.UPDATE */
@Controller('kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get()
  @RequirePermissions('HR.READ')
  async overview(
    @CurrentUser() u: AuthPrincipal,
    @Query('period') period?: string,
    @Query('group') group?: string,
  ) {
    const r = await this.kpi.overview(periodOr(period), group === 'BRANCH' ? 'BRANCH' : 'HQ');
    return { ...r, canEdit: this.kpi.canEdit(u) };
  }

  @Get(':scope/:id')
  @RequirePermissions('HR.READ')
  one(
    @CurrentUser() u: AuthPrincipal,
    @Param('scope') scope: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('period') period?: string,
  ) {
    return this.kpi.one(u, scope === 'EMPLOYEE' ? 'EMPLOYEE' : 'ORG', id, periodOr(period));
  }

  @Put()
  @RequirePermissions('HR.UPDATE')
  save(@CurrentUser() u: AuthPrincipal, @Body() dto: KpiSaveDto) {
    return this.kpi.save(u, dto);
  }

  @Delete(':scope/:id')
  @RequirePermissions('HR.UPDATE')
  reset(
    @CurrentUser() u: AuthPrincipal,
    @Param('scope') scope: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('period') period?: string,
  ) {
    return this.kpi.reset(u, scope === 'EMPLOYEE' ? 'EMPLOYEE' : 'ORG', id, periodOr(period));
  }
}
