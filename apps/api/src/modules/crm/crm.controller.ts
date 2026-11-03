import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  type PipeTransform,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CRM_ACTIVITY_KINDS,
  CRM_INTERESTS,
  isCrmPipeline,
  type AuthPrincipal,
  type CrmActivityKind,
  type CrmInterest,
  type CrmPipelineKey,
} from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PhoneDigits } from '../../common/phone';
import { CrmService } from './crm.service';
import { CrmImportService } from './crm-import.service';

/** :pipeline — FRANCHISE(가맹 영업) | B2B(기업영업), 소문자도 받는다 */
class PipelinePipe implements PipeTransform<string, CrmPipelineKey> {
  transform(v: string): CrmPipelineKey {
    const k = String(v ?? '').toUpperCase();
    if (!isCrmPipeline(k))
      throw new BadRequestException(
        '파이프라인은 FRANCHISE(가맹 영업)·B2B(기업영업) 중 하나입니다.',
      );
    return k;
  }
}

const nullable = () => ValidateIf((_, v) => v !== null && v !== '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class CrmLeadDto {
  @IsOptional() @IsString() @MaxLength(100) companyName?: string;
  @IsOptional() @nullable() @IsString() @MaxLength(50) contactName?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(50) contactTitle?: string | null;
  @IsOptional() @PhoneDigits() @nullable() @IsString() @MaxLength(20) phone?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(120) email?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(100) region?: string | null;
  @IsOptional() @IsString() @MaxLength(30) source?: string;
  @IsOptional() @IsString() @MaxLength(30) stage?: string;
  @IsOptional() @IsIn(CRM_INTERESTS) interest?: CrmInterest;
  @IsOptional() @nullable() @IsUUID() ownerEmpId?: string | null;
  @IsOptional() @nullable() @IsNumber() @Min(0) amount?: number | null;
  @IsOptional() @nullable() @IsISO8601() expectedAt?: string | null;
  @IsOptional() @nullable() @IsISO8601() nextActionAt?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(200) nextAction?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(3000) memo?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(500) lostReason?: string | null;
  /** 파이프라인만의 항목(업종·직원 수·면적·지금 하는 사업 …) */
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  /** 가맹: 지점 id · 기업영업: 거래처 id */
  @IsOptional() @nullable() @IsUUID() linkId?: string | null;
}

class ImportFileDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(14_000_000) dataBase64!: string;
}

class ImportDto {
  @IsOptional() @IsString() @MaxLength(2_000_000) text?: string;
  @IsOptional() @ValidateNested() @Type(() => ImportFileDto) file?: ImportFileDto;
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

class ActivityDto {
  @IsIn(CRM_ACTIVITY_KINDS) kind!: CrmActivityKind;
  @IsString() @MaxLength(3000) content!: string;
  @IsOptional() @nullable() @IsISO8601() at?: string | null;
  @IsOptional() @nullable() @IsISO8601() nextActionAt?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(200) nextAction?: string | null;
}

const dateOr = (s?: string) => {
  if (s && !DATE.test(s)) throw new BadRequestException('날짜는 YYYY-MM-DD로 넣어 주세요.');
  return s || undefined;
};

/**
 * 영업 CRM(공통 틀) — /crm/FRANCHISE(가맹 영업) · /crm/B2B(기업영업)
 * 권한은 파이프라인마다(FRANCHISE.* · B2B_CRM.*) 서비스에서 확인한다
 */
@Controller('crm/:pipeline')
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly importer: CrmImportService,
  ) {}

  /**
   * 가져오기 — 엑셀·구글 시트에서 복사한 표(text) 또는 CSV·xlsx(file). dryRun이면 미리보기만.
   * 머리글로 항목을 맞추고, 같은 업체(연락처·업체명)는 건너뛴다
   */
  @Post('import')
  import(
    @CurrentUser() user: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Body() dto: ImportDto,
  ) {
    return this.importer.run(
      user,
      pipeline,
      {
        text: dto.text,
        file: dto.file ? { name: dto.file.name, dataBase64: dto.file.dataBase64 } : undefined,
      },
      dto.dryRun !== false,
    );
  }

  @Get('leads')
  list(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Query('stage') stage?: string,
    @Query('ownerEmpId') ownerEmpId?: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.crm.list(u, pipeline, {
      stage,
      ownerEmpId,
      source,
      q,
      from: dateOr(from),
      to: dateOr(to),
    });
  }

  @Get('stats')
  stats(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownerEmpId') ownerEmpId?: string,
    @Query('source') source?: string,
  ) {
    return this.crm.stats(u, pipeline, { from: dateOr(from), to: dateOr(to), ownerEmpId, source });
  }

  @Get('leads/:id')
  one(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crm.one(u, pipeline, id);
  }

  @Post('leads')
  create(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Body() dto: CrmLeadDto,
  ) {
    return this.crm.create(u, pipeline, dto);
  }

  @Patch('leads/:id')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmLeadDto,
  ) {
    return this.crm.update(u, pipeline, id, dto);
  }

  @Delete('leads/:id')
  remove(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crm.remove(u, pipeline, id);
  }

  @Post('leads/:id/activities')
  addActivity(
    @CurrentUser() u: AuthPrincipal,
    @Param('pipeline', PipelinePipe) pipeline: CrmPipelineKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityDto,
  ) {
    return this.crm.addActivity(u, pipeline, id, dto);
  }
}
