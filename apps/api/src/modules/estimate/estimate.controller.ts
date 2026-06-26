import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { B2B_DOCUMENT_KINDS, type AuthPrincipal, type B2bDocumentKind } from '@tongin/shared';
import { EstimateService } from './estimate.service';
import { EstimateB2bService } from './estimate-b2b.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { CreateLineDto, CreateZoneDto } from './dto/estimate-child.dto';
import { CreateCostLineDto } from './dto/cost-line.dto';
import { UpsertCostBuildupDto } from './dto/cost-buildup.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('estimates')
export class EstimateController {
  constructor(
    private readonly estimateService: EstimateService,
    private readonly b2bService: EstimateB2bService,
  ) {}

  @Get()
  @RequirePermissions('ESTIMATE.READ')
  findAll(@CurrentUser() user: AuthPrincipal, @Query('leadId') leadId?: string) {
    return this.estimateService.findAll(leadId, user);
  }

  @Get(':id')
  @RequirePermissions('ESTIMATE.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.findOne(id, user);
  }

  @Post()
  @RequirePermissions('ESTIMATE.WRITE')
  create(@Body() dto: CreateEstimateDto) {
    return this.estimateService.create(dto);
  }

  @Post(':id/zones')
  @RequirePermissions('ESTIMATE.WRITE')
  addZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateZoneDto) {
    return this.estimateService.addZone(id, dto);
  }

  @Post(':id/lines')
  @RequirePermissions('ESTIMATE.WRITE')
  addLine(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLineDto) {
    return this.estimateService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.estimateService.removeLine(id, lineId);
  }

  @Post(':id/quote')
  @RequirePermissions('ESTIMATE.WRITE')
  quote(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.quote(id);
  }

  // ── EST-03: 재료비 라인 ↔ 자재·재고 ──

  @Post(':id/cost-lines')
  @RequirePermissions('ESTIMATE.WRITE')
  addCostLine(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCostLineDto) {
    return this.estimateService.addCostLine(id, dto);
  }

  @Delete(':id/cost-lines/:costLineId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeCostLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('costLineId', ParseUUIDPipe) costLineId: string,
  ) {
    return this.estimateService.removeCostLine(id, costLineId);
  }

  /** 재료비 라인의 자재를 재고에서 일괄 차감(전표 OUT). */
  @Post(':id/deduct-materials')
  @RequirePermissions('ESTIMATE.WRITE')
  deductMaterials(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.deductMaterials(id);
  }

  @Get(':id/document')
  @RequirePermissions('ESTIMATE.READ')
  @Header('Content-Type', 'text/html; charset=utf-8')
  document(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.document(id);
  }

  // ── EST-04: 기업이전(B2B) 원가 적상식 + 3종 문서 ──

  @Get(':id/cost-buildup')
  @RequirePermissions('ESTIMATE.READ')
  getBuildup(@Param('id', ParseUUIDPipe) id: string) {
    return this.b2bService.getBreakdown(id);
  }

  @Put(':id/cost-buildup')
  @RequirePermissions('ESTIMATE.WRITE')
  setBuildup(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertCostBuildupDto) {
    return this.b2bService.upsertBuildup(id, dto);
  }

  /** 기업이전 3종 문서: kind = quote(견적서) | items(물품내역서) | cost(산출내역서). */
  @Get(':id/documents/:kind')
  @RequirePermissions('ESTIMATE.READ')
  @Header('Content-Type', 'text/html; charset=utf-8')
  b2bDocument(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string) {
    if (!(B2B_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(
        `문서종류는 ${B2B_DOCUMENT_KINDS.join(' | ')} 중 하나여야 합니다.`,
      );
    }
    return this.b2bService.document(id, kind as B2bDocumentKind);
  }
}
