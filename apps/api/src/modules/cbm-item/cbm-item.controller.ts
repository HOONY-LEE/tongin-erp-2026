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
import { CbmItemService } from './cbm-item.service';
import { CreateCbmItemDto } from './dto/create-cbm-item.dto';
import { UpdateCbmItemDto } from './dto/update-cbm-item.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('cbm-items')
export class CbmItemController {
  constructor(private readonly cbmItemService: CbmItemService) {}

  @Get()
  @RequirePermissions('CBM_ITEM.READ')
  findAll(@Query('category') category?: string) {
    return this.cbmItemService.findAll(category);
  }

  @Get(':id')
  @RequirePermissions('CBM_ITEM.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cbmItemService.findOne(id);
  }

  @Post()
  @RequirePermissions('CBM_ITEM.WRITE')
  create(@Body() dto: CreateCbmItemDto) {
    return this.cbmItemService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('CBM_ITEM.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCbmItemDto) {
    return this.cbmItemService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('CBM_ITEM.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cbmItemService.remove(id);
  }
}
