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
import { CommonCodeService } from './common-code.service';
import { CreateCommonCodeDto } from './dto/create-common-code.dto';
import { UpdateCommonCodeDto } from './dto/update-common-code.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('common-codes')
export class CommonCodeController {
  constructor(private readonly commonCodeService: CommonCodeService) {}

  @Get()
  @RequirePermissions('COMMON_CODE.READ')
  findAll(@Query('group') group?: string) {
    return this.commonCodeService.findAll(group);
  }

  @Get(':id')
  @RequirePermissions('COMMON_CODE.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.commonCodeService.findOne(id);
  }

  @Post()
  @RequirePermissions('COMMON_CODE.WRITE')
  create(@Body() dto: CreateCommonCodeDto) {
    return this.commonCodeService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('COMMON_CODE.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommonCodeDto) {
    return this.commonCodeService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('COMMON_CODE.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.commonCodeService.remove(id);
  }
}
