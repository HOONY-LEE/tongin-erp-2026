import {
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
import { HR_TARGET_TYPES, type HrTargetType } from '@tongin/shared';
import { BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get('policies')
  @RequirePermissions('HR.READ')
  findAll() {
    return this.hr.findAll();
  }

  @Post('policies')
  @RequirePermissions('HR.WRITE')
  create(@Body() dto: CreatePolicyDto) {
    return this.hr.create(dto);
  }

  @Patch('policies/:id')
  @RequirePermissions('HR.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto) {
    return this.hr.update(id, dto);
  }

  @Delete('policies/:id')
  @RequirePermissions('HR.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.hr.remove(id);
  }

  /** 정책 적용 계산: 연월 + 대상유형(EMPLOYEE|BRANCH). */
  @Get('payout')
  @RequirePermissions('HR.READ')
  payout(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('targetType') targetType: string,
  ) {
    if (!HR_TARGET_TYPES.includes(targetType as HrTargetType)) {
      throw new BadRequestException(
        `targetType은 ${HR_TARGET_TYPES.join(' | ')} 중 하나여야 합니다.`,
      );
    }
    return this.hr.computePayout(Number(year), Number(month), targetType as HrTargetType);
  }
}
