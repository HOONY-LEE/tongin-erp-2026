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
} from '@nestjs/common';
import { OrgUnitService } from './org-unit.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

@Controller('org-units')
export class OrgUnitController {
  constructor(private readonly orgUnitService: OrgUnitService) {}

  @Get()
  findAll() {
    return this.orgUnitService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgUnitService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrgUnitDto) {
    return this.orgUnitService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.orgUnitService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgUnitService.remove(id);
  }
}
