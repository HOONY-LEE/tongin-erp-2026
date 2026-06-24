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
import { AddonServiceService } from './addon-service.service';
import { CreateAddonServiceDto } from './dto/create-addon-service.dto';
import { UpdateAddonServiceDto } from './dto/update-addon-service.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('addon-services')
export class AddonServiceController {
  constructor(private readonly addonServiceService: AddonServiceService) {}

  @Get()
  @RequirePermissions('ADDON.READ')
  findAll() {
    return this.addonServiceService.findAll();
  }

  @Get(':id')
  @RequirePermissions('ADDON.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.addonServiceService.findOne(id);
  }

  @Post()
  @RequirePermissions('ADDON.WRITE')
  create(@Body() dto: CreateAddonServiceDto) {
    return this.addonServiceService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ADDON.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddonServiceDto) {
    return this.addonServiceService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ADDON.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.addonServiceService.remove(id);
  }
}
