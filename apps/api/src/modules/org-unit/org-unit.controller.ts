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
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('org-units')
export class OrgUnitController {
  constructor(private readonly orgUnitService: OrgUnitService) {}

  @Get()
  @RequirePermissions('ORG_UNIT.READ')
  findAll() {
    return this.orgUnitService.findAll();
  }

  @Get(':id')
  @RequirePermissions('ORG_UNIT.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgUnitService.findOne(id);
  }

  @Post()
  @RequirePermissions('ORG_UNIT.WRITE')
  create(@Body() dto: CreateOrgUnitDto) {
    return this.orgUnitService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ORG_UNIT.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.orgUnitService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ORG_UNIT.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgUnitService.remove(id);
  }
}
