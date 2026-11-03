import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { SpaceService } from './space.service';

class SpaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(['MEETING', 'RENTAL'])
  kind?: 'MEETING' | 'RENTAL';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  location?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10000)
  capacity?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  facilities?: string[];

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  hourlyFee?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  openHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  closeHour?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

class ReservationDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attendeeEmpIds?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  customerName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(30)
  customerPhone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10000)
  headcount?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  fee?: number | null;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 공간 예약 — 보기·예약은 로그인만으로, 공간 관리는 SPACE.MANAGE */
@Controller('spaces')
export class SpaceController {
  constructor(private readonly svc: SpaceService) {}

  @Get()
  list(@CurrentUser() u: AuthPrincipal, @Query('all') all?: string) {
    return this.svc.spaces(u, all === '1');
  }

  @Post()
  @RequirePermissions('SPACE.MANAGE')
  create(@Body() dto: SpaceDto) {
    return this.svc.createSpace(dto);
  }

  @Patch(':id')
  @RequirePermissions('SPACE.MANAGE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SpaceDto) {
    return this.svc.updateSpace(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('SPACE.MANAGE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeSpace(id);
  }

  /** 기간(한국 날짜 from~to, 포함) 예약 — spaceId로 한 공간만 */
  @Get('reservations')
  reservations(
    @CurrentUser() u: AuthPrincipal,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('spaceId') spaceId?: string,
  ) {
    if (!DATE.test(from ?? '') || !DATE.test(to ?? ''))
      throw new BadRequestException('기간(from·to, YYYY-MM-DD)을 넣어 주세요.');
    if (spaceId && !/^[0-9a-f-]{36}$/i.test(spaceId))
      throw new BadRequestException('공간 번호 형식이 올바르지 않습니다.');
    return this.svc.reservations(u, from, to, spaceId);
  }

  @Post('reservations')
  reserve(@CurrentUser() u: AuthPrincipal, @Body() dto: ReservationDto) {
    return this.svc.create(dto, u);
  }

  @Patch('reservations/:id')
  updateReservation(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationDto,
  ) {
    return this.svc.update(id, dto, u);
  }

  @Delete('reservations/:id')
  @HttpCode(204)
  async cancel(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.cancel(id, u);
  }
}
