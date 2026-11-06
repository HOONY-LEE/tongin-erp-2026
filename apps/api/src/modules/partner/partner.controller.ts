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
import { PartnerService } from './partner.service';
import { CreatePartnerDto, ImportPartnersDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('partners')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get()
  @RequirePermissions('PARTNER.READ')
  findAll(@Query('type') type?: string) {
    return this.partnerService.findAll(type);
  }

  /**
   * 접수에서 고를 업체 — 사용 중인 제휴·전속·B2B만(이름·유형). 지점 직원도 제휴이사를 접수하므로
   * 거래처 권한 없이 접수 권한으로 본다. 내용(혜택)은 접수 상세에서 보인다.
   */
  @Get('options')
  @RequirePermissions('LEAD.READ')
  options() {
    return this.partnerService.options();
  }

  @Get(':id')
  @RequirePermissions('PARTNER.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnerService.findOne(id);
  }

  /** 제휴·전속 업체 상세 — 최근 접수 포함 */
  @Get(':id/detail')
  @RequirePermissions('PARTNER.READ')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnerService.detail(id);
  }

  /** 제휴·전속 목록 한꺼번에 넣기(같은 이름은 건너뜀) */
  @Post('import')
  @RequirePermissions('PARTNER.CREATE')
  importMany(@Body() dto: ImportPartnersDto) {
    return this.partnerService.importMany(dto.type, dto.rows);
  }

  @Post()
  @RequirePermissions('PARTNER.CREATE')
  create(@Body() dto: CreatePartnerDto) {
    return this.partnerService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('PARTNER.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('PARTNER.DELETE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnerService.remove(id);
  }
}
