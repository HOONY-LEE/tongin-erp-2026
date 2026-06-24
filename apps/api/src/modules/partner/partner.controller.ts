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
import { CreatePartnerDto } from './dto/create-partner.dto';
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

  @Get(':id')
  @RequirePermissions('PARTNER.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnerService.findOne(id);
  }

  @Post()
  @RequirePermissions('PARTNER.WRITE')
  create(@Body() dto: CreatePartnerDto) {
    return this.partnerService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('PARTNER.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnerService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('PARTNER.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnerService.remove(id);
  }
}
