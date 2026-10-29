import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CorpAssetService } from './corp-asset.service';
import { CreateCorpAssetDto, UpdateCorpAssetDto } from './dto/corp-asset.dto';

@Controller('assets')
export class CorpAssetController {
  constructor(private readonly assets: CorpAssetService) {}

  @Get()
  @RequirePermissions('ASSET.READ')
  findAll(@Query('kind') kind?: string, @Query('q') q?: string) {
    return this.assets.findAll(kind, q);
  }

  @Get(':id')
  @RequirePermissions('ASSET.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.findOne(id);
  }

  @Post()
  @RequirePermissions('ASSET.CREATE')
  create(@Body() dto: CreateCorpAssetDto) {
    return this.assets.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ASSET.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCorpAssetDto) {
    return this.assets.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ASSET.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.remove(id);
  }
}
