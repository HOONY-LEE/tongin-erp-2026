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
import { AddonServiceService } from './addon-service.service';
import { CreateAddonServiceDto } from './dto/create-addon-service.dto';
import { UpdateAddonServiceDto } from './dto/update-addon-service.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('addon-services')
export class AddonServiceController {
  constructor(private readonly addonServiceService: AddonServiceService) {}

  @Get()
  @RequirePermissions('ADDON.READ')
  findAll(@Query('active') active?: string) {
    return this.addonServiceService.findAll(active === '1' || active === 'true');
  }

  @Get(':id')
  @RequirePermissions('ADDON.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.addonServiceService.findOne(id);
  }

  @Post()
  @RequirePermissions('ADDON.CREATE')
  create(@Body() dto: CreateAddonServiceDto) {
    return this.addonServiceService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ADDON.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddonServiceDto) {
    return this.addonServiceService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ADDON.DELETE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.addonServiceService.remove(id);
  }
}
