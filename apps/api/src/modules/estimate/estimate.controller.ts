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
import {
  CreateAddonDto,
  CreateLineDto,
  CreateZoneDto,
  UpdateAmountsDto,
  UpdateConditionsDto,
} from './dto/estimate-child.dto';
import { CreateCostLineDto } from './dto/cost-line.dto';
import { SaveBasicDto, SaveItemsDto, SaveOptionsDto } from './dto/estimate-tabs.dto';
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
    // 화면용 — 견적서 메타(접수·계약·작업에서 모은 머리 정보)까지 함께 준다
    return this.estimateService.detail(id, user);
  }

  @Post()
  @RequirePermissions('ESTIMATE.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateEstimateDto) {
    return this.estimateService.create(dto, user);
  }

  @Post(':id/zones')
  @RequirePermissions('ESTIMATE.WRITE')
  addZone(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateZoneDto,
  ) {
    return this.estimateService.addZone(id, dto, user);
  }

  @Post(':id/lines')
  @RequirePermissions('ESTIMATE.WRITE')
  addLine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLineDto,
  ) {
    return this.estimateService.addLine(id, dto, user);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeLine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.estimateService.removeLine(id, lineId, user);
  }

  /** 견적 옵션(부가서비스) 담기 — 상품관리의 옵션 카탈로그에서 고르거나 자유 입력. */
  @Post(':id/addons')
  @RequirePermissions('ESTIMATE.WRITE')
  addAddon(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddonDto,
  ) {
    return this.estimateService.addAddon(id, dto, user);
  }

  @Delete(':id/addons/:addonId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeAddon(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addonId', ParseUUIDPipe) addonId: string,
  ) {
    return this.estimateService.removeAddon(id, addonId, user);
  }

  // ── 견적 상세 4단계 탭 저장 ──

  /** 1. 기본정보(이사종류·주소·상담일·이사일). 주소·날짜는 접수에도 반영된다. */
  @Put(':id/basic')
  @RequirePermissions('ESTIMATE.WRITE')
  saveBasic(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveBasicDto,
  ) {
    return this.estimateService.saveBasic(id, dto, user);
  }

  /** 2. 물품정보(방·물품 전체 교체). */
  @Put(':id/items')
  @RequirePermissions('ESTIMATE.WRITE')
  saveItems(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemsDto,
  ) {
    return this.estimateService.saveItems(id, dto, user);
  }

  /** 3. 옵션선택(작업조건 + 옵션 전체 교체). */
  @Put(':id/options')
  @RequirePermissions('ESTIMATE.WRITE')
  saveOptions(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveOptionsDto,
  ) {
    return this.estimateService.saveOptions(id, dto, user);
  }

  /** 작업조건(전/후 평수·사다리차/엘리베이터/계단/기타) 수정. */
  @Put(':id/conditions')
  @RequirePermissions('ESTIMATE.WRITE')
  updateConditions(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConditionsDto,
  ) {
    return this.estimateService.updateConditions(id, dto, user);
  }

  /** 이사비용·부가세·계약금·잔금 확정(견적서 발송 전). 총액은 서버가 계산한다. */
  @Put(':id/amounts')
  @RequirePermissions('ESTIMATE.WRITE')
  updateAmounts(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAmountsDto,
  ) {
    return this.estimateService.updateAmounts(id, dto, user);
  }

  @Post(':id/quote')
  @RequirePermissions('ESTIMATE.WRITE')
  quote(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.quote(id, user);
  }

  // ── EST-03: 재료비 라인 ↔ 자재·재고 ──

  @Post(':id/cost-lines')
  @RequirePermissions('ESTIMATE.WRITE')
  addCostLine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCostLineDto,
  ) {
    return this.estimateService.addCostLine(id, dto, user);
  }

  @Delete(':id/cost-lines/:costLineId')
  @RequirePermissions('ESTIMATE.WRITE')
  @HttpCode(200)
  removeCostLine(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('costLineId', ParseUUIDPipe) costLineId: string,
  ) {
    return this.estimateService.removeCostLine(id, costLineId, user);
  }

  /** 재료비 라인의 자재를 재고에서 일괄 차감(전표 OUT). */
  @Post(':id/deduct-materials')
  @RequirePermissions('ESTIMATE.WRITE')
  deductMaterials(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.deductMaterials(id, user);
  }

  /** 접수 상세 = 견적서 화면 — 접수의 견적(없으면 만들어서) id */
  @Post('for-lead/:leadId')
  @RequirePermissions('ESTIMATE.READ')
  forLead(@CurrentUser() user: AuthPrincipal, @Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.estimateService.forLead(leadId, user);
  }

  @Get(':id/document')
  @RequirePermissions('ESTIMATE.READ')
  @Header('Content-Type', 'text/html; charset=utf-8')
  document(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.estimateService.document(id, user);
  }

  // ── EST-04: 기업이전(B2B) 원가 적상식 + 3종 문서 ──

  @Get(':id/cost-buildup')
  @RequirePermissions('ESTIMATE.READ')
  getBuildup(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.b2bService.getBreakdown(id, user);
  }

  @Put(':id/cost-buildup')
  @RequirePermissions('ESTIMATE.WRITE')
  setBuildup(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCostBuildupDto,
  ) {
    return this.b2bService.upsertBuildup(id, dto, user);
  }

  /** 기업이전 3종 문서: kind = quote(견적서) | items(물품내역서) | cost(산출내역서). */
  @Get(':id/documents/:kind')
  @RequirePermissions('ESTIMATE.READ')
  @Header('Content-Type', 'text/html; charset=utf-8')
  b2bDocument(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
  ) {
    if (!(B2B_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(
        `문서종류는 ${B2B_DOCUMENT_KINDS.join(' | ')} 중 하나여야 합니다.`,
      );
    }
    return this.b2bService.document(id, kind as B2bDocumentKind, user);
  }
}
