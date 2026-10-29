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
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { NoticeService } from './notice.service';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

/** 공지사항 — 조회는 로그인만으로(내게 온 공지, NOTICE.READ면 전부), 쓰기는 NOTICE.* */
@Controller('notices')
export class NoticeController {
  constructor(private readonly notices: NoticeService) {}

  @Get()
  findAll(@CurrentUser() p: AuthPrincipal, @Query('q') q?: string) {
    return this.notices.findAll(p, q);
  }

  @Get(':id')
  findOne(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.notices.findOne(p, id);
  }

  @Post()
  @RequirePermissions('NOTICE.CREATE')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateNoticeDto) {
    return this.notices.create(p, dto);
  }

  @Patch(':id')
  @RequirePermissions('NOTICE.UPDATE')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoticeDto,
  ) {
    return this.notices.update(p, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('NOTICE.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.notices.remove(id);
  }
}
