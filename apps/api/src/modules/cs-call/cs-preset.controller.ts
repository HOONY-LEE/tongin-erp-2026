import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

class PresetDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MinLength(1) @MaxLength(30) title!: string;
  @IsString() @MaxLength(2000) body!: string;
}
class OrderDto {
  @IsUUID('all', { each: true }) ids!: string[];
}

/** 상담 관리자(상담 콘솔 전체 보기 권한)만 프리셋을 고친다 */
const assertManager = (p: AuthPrincipal) => {
  if (!p.permissions.includes('*') && !p.permissions.includes('CS_CALL.ALL'))
    throw new ForbiddenException('상담 메모 프리셋은 상담 관리자만 고칠 수 있습니다.');
};

/** 상담 메모 프리셋 — 상담 화면 상담 메모에 불러 쓰는 틀. 보기는 상담원 모두, 고치기는 상담 관리자 */
@Controller('cs-memo-presets')
export class CsPresetController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('LEAD.CREATE')
  list() {
    return this.prisma.csMemoPreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, body: true, sortOrder: true },
    });
  }

  @Post()
  @RequirePermissions('LEAD.CREATE')
  async save(@CurrentUser() user: AuthPrincipal, @Body() dto: PresetDto) {
    assertManager(user);
    const data = { title: dto.title.trim(), body: dto.body };
    if (dto.id) {
      const cur = await this.prisma.csMemoPreset.findUnique({ where: { id: dto.id } });
      if (!cur) throw new NotFoundException('프리셋을 찾을 수 없습니다.');
      return this.prisma.csMemoPreset.update({ where: { id: dto.id }, data });
    }
    const max = await this.prisma.csMemoPreset.aggregate({ _max: { sortOrder: true } });
    return this.prisma.csMemoPreset.create({
      data: { ...data, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  /** 순서 바꾸기 — 보낸 id 순서대로 */
  @Post('order')
  @RequirePermissions('LEAD.CREATE')
  async order(@CurrentUser() user: AuthPrincipal, @Body() dto: OrderDto) {
    assertManager(user);
    await this.prisma.$transaction(
      dto.ids.map((id, i) =>
        this.prisma.csMemoPreset.updateMany({ where: { id }, data: { sortOrder: i } }),
      ),
    );
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions('LEAD.CREATE')
  async remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    assertManager(user);
    await this.prisma.csMemoPreset.deleteMany({ where: { id } });
    return { ok: true };
  }
}
