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
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  DASH_COLOR_KEYS,
  DASH_METRICS,
  DASH_PERIODS,
  type AuthPrincipal,
  type DashColorKey,
  type DashMetric,
  type DashPeriod,
} from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { DashboardDataService } from './dashboard-data.service';
import { DashboardService } from './dashboard.service';

class LayoutDto {
  @IsObject()
  layout!: Record<string, unknown>;
}

class TemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPersonal?: boolean;

  /** 차트 색(통인 테마색 또는 애플 시스템 색) */
  @IsOptional()
  @IsIn(DASH_COLOR_KEYS)
  color?: DashColorKey;
}

class AssignDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  roleIds!: string[];

  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  userIds!: string[];
}

class DataItemDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsString()
  @MaxLength(60)
  widget!: string;

  @IsOptional()
  @IsIn(DASH_PERIODS)
  period?: DashPeriod;

  @IsOptional()
  @IsIn(DASH_METRICS)
  metric?: DashMetric;
}

class DataDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => DataItemDto)
  items!: DataItemDto[];
}

/** 대시보드 — 내 대시보드(누구나, 위젯마다 권한 확인) + 템플릿 관리(DASHBOARD.*) */
@Controller('dashboards')
export class DashboardController {
  constructor(
    private readonly dashboards: DashboardService,
    private readonly data: DashboardDataService,
  ) {}

  @Get('me')
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.dashboards.mine(user);
  }

  @Put('me')
  saveMine(@CurrentUser() user: AuthPrincipal, @Body() dto: LayoutDto) {
    return this.dashboards.saveMine(user, dto.layout);
  }

  @Delete('me')
  resetMine(@CurrentUser() user: AuthPrincipal) {
    return this.dashboards.resetMine(user);
  }

  /** 위젯 데이터 여러 개를 한 번에 — 위젯마다 권한·데이터 범위를 확인한다 */
  @Post('data')
  widgetData(@CurrentUser() user: AuthPrincipal, @Body() dto: DataDto) {
    return this.data.many(dto.items, user);
  }

  @Get('templates')
  @RequirePermissions('DASHBOARD.READ')
  templates() {
    return this.dashboards.templates();
  }

  @Get('targets')
  @RequirePermissions('DASHBOARD.READ')
  targets() {
    return this.dashboards.targets();
  }

  @Get('templates/:id')
  @RequirePermissions('DASHBOARD.READ')
  template(@Param('id', ParseUUIDPipe) id: string) {
    return this.dashboards.template(id);
  }

  @Post('templates')
  @RequirePermissions('DASHBOARD.CREATE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: TemplateDto) {
    return this.dashboards.createTemplate(dto, user);
  }

  @Patch('templates/:id')
  @RequirePermissions('DASHBOARD.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto) {
    return this.dashboards.updateTemplate(id, dto);
  }

  @Put('templates/:id/assignments')
  @RequirePermissions('DASHBOARD.UPDATE')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.dashboards.assign(id, dto.roleIds, dto.userIds);
  }

  @Delete('templates/:id')
  @RequirePermissions('DASHBOARD.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.dashboards.removeTemplate(id);
  }
}
