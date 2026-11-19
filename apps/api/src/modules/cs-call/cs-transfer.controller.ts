import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const digits = (s: string) => s.replace(/\D/g, '');

class TargetDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MinLength(1) @MaxLength(40) label!: string;
  @IsString() @MinLength(7) @MaxLength(20) number!: string;
}
class TransferredDto {
  @IsString() @MaxLength(20) phone!: string;
  @IsString() @MaxLength(80) to!: string;
}

const assertManager = (p: AuthPrincipal) => {
  if (!p.permissions.includes('*') && !p.permissions.includes('CS_CALL.ALL'))
    throw new ForbiddenException('돌려주기 연락처는 상담 관리자만 고칠 수 있습니다.');
};

/**
 * 돌려주기 — 상담원이 통화를 사무실 직원·부서로 넘긴다(PC 전화가 한국AI통신에 SIP REFER).
 * 연락처 목록은 상담원 모두 보고, 상담 관리자가 고친다. 넘긴 기록은 그 콜에 남긴다.
 */
@Controller()
export class CsTransferController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('cs-transfer-targets')
  @RequirePermissions('LEAD.CREATE')
  list() {
    return this.prisma.csTransferTarget.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, number: true },
    });
  }

  @Post('cs-transfer-targets')
  @RequirePermissions('LEAD.CREATE')
  async save(@CurrentUser() user: AuthPrincipal, @Body() dto: TargetDto) {
    assertManager(user);
    const number = digits(dto.number);
    if (number.length < 7) throw new BadRequestException('번호를 확인해 주세요.');
    const data = { label: dto.label.trim(), number };
    if (dto.id) return this.prisma.csTransferTarget.update({ where: { id: dto.id }, data });
    const max = await this.prisma.csTransferTarget.aggregate({ _max: { sortOrder: true } });
    return this.prisma.csTransferTarget.create({
      data: { ...data, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  @Delete('cs-transfer-targets/:id')
  @RequirePermissions('LEAD.CREATE')
  async remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    assertManager(user);
    await this.prisma.csTransferTarget.deleteMany({ where: { id } });
    return { ok: true };
  }

  /** 돌려주기 성공 — 내가 그 번호와 통화 중이던(마무리 전) 콜에 넘긴 곳을 남긴다 */
  @Post('cs-calls/transferred')
  @RequirePermissions('LEAD.CREATE')
  async transferred(@CurrentUser() user: AuthPrincipal, @Body() dto: TransferredDto) {
    if (!user.employeeId) return { ok: false };
    const call = await this.prisma.csCall.findFirst({
      where: {
        agentEmpId: user.employeeId,
        phone: digits(dto.phone),
        status: { in: ['ASSIGNED', 'CALLBACK'] },
      },
      orderBy: { assignedAt: 'desc' },
      select: { id: true },
    });
    if (!call) return { ok: false };
    await this.prisma.csCall.update({
      where: { id: call.id },
      data: { transferTo: dto.to.trim(), transferredAt: new Date() },
    });
    return { ok: true, callId: call.id };
  }
}
