import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { FRANCHISE_STATUSES, type AuthPrincipal, type FranchiseStatus } from '@tongin/shared';
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
}
