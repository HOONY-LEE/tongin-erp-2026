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
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  FRANCHISE_ACTIVITY_KINDS,
  FRANCHISE_INTERESTS,
  FRANCHISE_LEAD_SOURCES,
  FRANCHISE_LEAD_STAGES,
  FRANCHISE_STATUSES,
  type AuthPrincipal,
  type FranchiseActivityKind,
  type FranchiseInterest,
  type FranchiseLeadSource,
  type FranchiseLeadStage,
  type FranchiseStatus,
} from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { PhoneDigits } from '../../common/phone';
import { FranchiseService } from './franchise.service';

const nullable = () => ValidateIf((_, v) => v !== null && v !== '');

class FranchiseInfoDto {
  @IsOptional()
  @IsIn(FRANCHISE_STATUSES)
  status?: FranchiseStatus;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(50)
  ownerName?: string | null;

  @IsOptional()
  @PhoneDigits()
  @nullable()
  @IsString()
  @MaxLength(20)
  ownerPhone?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(20)
  bizNo?: string | null;

  @IsOptional()
  @nullable()
  @IsISO8601()
  contractStart?: string | null;

  @IsOptional()
  @nullable()
  @IsISO8601()
  contractEnd?: string | null;

  @IsOptional()
  @nullable()
  @IsNumber()
  @Min(0)
  franchiseFee?: number | null;

  @IsOptional()
  @nullable()
  @IsISO8601()
  feePaidAt?: string | null;

  @IsOptional()
  @nullable()
  @IsNumber()
  @Min(0)
  deposit?: number | null;

  @IsOptional()
  @nullable()
  @IsISO8601()
  depositPaidAt?: string | null;

  @IsOptional()
  @nullable()
  @IsNumber()
  @Min(0)
  royalty?: number | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;
}

class FranchiseLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(50)
  contactName?: string | null;

  @IsOptional()
  @PhoneDigits()
  @nullable()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(100)
  region?: string | null;

  @IsOptional()
  @IsIn(FRANCHISE_LEAD_SOURCES)
  source?: FranchiseLeadSource;

  @IsOptional()
  @IsIn(FRANCHISE_LEAD_STAGES)
  stage?: FranchiseLeadStage;

  @IsOptional()
  @IsIn(FRANCHISE_INTERESTS)
  interest?: FranchiseInterest;

  @IsOptional()
  @nullable()
  @IsUUID()
  ownerEmpId?: string | null;

  @IsOptional()
  @nullable()
  @IsISO8601()
  nextActionAt?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(200)
  nextAction?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(500)
  currentBiz?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(3000)
  memo?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(500)
  lostReason?: string | null;

  @IsOptional()
  @nullable()
  @IsUUID()
  branchId?: string | null;
}

class ActivityDto {
  @IsIn(FRANCHISE_ACTIVITY_KINDS)
  kind!: FranchiseActivityKind;

  @IsString()
  @MaxLength(3000)
  content!: string;

  @IsOptional()
  @nullable()
  @IsISO8601()
  at?: string | null;

  @IsOptional()
  @nullable()
  @IsISO8601()
  nextActionAt?: string | null;

  @IsOptional()
  @nullable()
  @IsString()
  @MaxLength(200)
  nextAction?: string | null;
}

/** 가맹 — 가맹점 현황 · 가맹 영업 CRM */
@Controller('franchise')
export class FranchiseController {
  constructor(private readonly svc: FranchiseService) {}

  @Get('branches')
  @RequirePermissions('FRANCHISE.READ')
  branches() {
    return this.svc.branches();
  }

  @Put('branches/:orgUnitId')
  @RequirePermissions('FRANCHISE.UPDATE')
  saveInfo(
    @CurrentUser() u: AuthPrincipal,
    @Param('orgUnitId', ParseUUIDPipe) id: string,
    @Body() dto: FranchiseInfoDto,
  ) {
    return this.svc.saveInfo(u, id, dto);
  }

  @Get('leads')
  @RequirePermissions('FRANCHISE.READ')
  leads() {
    return this.svc.leads();
  }

  @Get('leads/:id')
  @RequirePermissions('FRANCHISE.READ')
  lead(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.lead(id);
  }

  @Post('leads')
  @RequirePermissions('FRANCHISE.CREATE')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: FranchiseLeadDto) {
    return this.svc.create(u, dto);
  }

  @Patch('leads/:id')
  @RequirePermissions('FRANCHISE.UPDATE')
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FranchiseLeadDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  @Delete('leads/:id')
  @RequirePermissions('FRANCHISE.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }

  @Post('leads/:id/activities')
  @RequirePermissions('FRANCHISE.UPDATE')
  addActivity(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityDto,
  ) {
    return this.svc.addActivity(u, id, dto);
  }
}
