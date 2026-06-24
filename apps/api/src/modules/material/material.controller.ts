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
import { MaterialService } from './material.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('materials')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  @Get()
  @RequirePermissions('MATERIAL.READ')
  findAll(@Query('category') category?: string) {
    return this.materialService.findAll(category);
  }

  @Get(':id')
  @RequirePermissions('MATERIAL.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialService.findOne(id);
  }

  @Post()
  @RequirePermissions('MATERIAL.WRITE')
  create(@Body() dto: CreateMaterialDto) {
    return this.materialService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('MATERIAL.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('MATERIAL.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialService.remove(id);
  }

  @Post(':id/movements')
  @RequirePermissions('MATERIAL.WRITE')
  createMovement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMovementDto) {
    return this.materialService.createMovement(id, dto);
  }
}
