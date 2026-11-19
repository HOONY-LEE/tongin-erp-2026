import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  type OnModuleInit,
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
  @IsOptional() @IsString() @MaxLength(40) dept?: string;
  @IsOptional() @IsString() @MaxLength(20) extNo?: string;
  @IsString() @MinLength(7) @MaxLength(20) number!: string;
  @IsOptional() @IsString() @MaxLength(200) memo?: string;
}
class TransferredDto {
  @IsString() @MaxLength(20) phone!: string;
  @IsString() @MaxLength(80) to!: string;
}

const has = (p: AuthPrincipal, ...perms: string[]) =>
  p.permissions.includes('*') || perms.some((x) => p.permissions.includes(x));
/** 내선 등록·수정 — 내선 관리 권한(관리자) */
const assertManager = (p: AuthPrincipal) => {
  if (!has(p, 'CS_CALL.EXTENSIONS'))
    throw new ForbiddenException('내선은 내선 관리 권한이 있는 관리자만 고칠 수 있습니다.');
};

interface SeedRow {
  label: string;
  dept?: string;
  extNo?: string;
  number: string;
}

/**
 * 돌려주기 — 상담원이 통화를 사무실 직원·부서로 넘긴다(PC 전화가 한국AI통신에 SIP REFER).
 * 내선(연락처) 목록은 상담원 모두 보고, 상담 관리자가 고친다(내선 관리 화면). 넘긴 기록은 그 콜에 남긴다.
 */
@Controller()
export class CsTransferController implements OnModuleInit {
  private readonly logger = new Logger('CsTransfer');
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 내선 목록 채우기 — 환경변수 CS_EXTENSIONS_SEED(JSON 배열)에 있는 내선 중 아직 없는 번호만 더한다.
   * 직원 이름·번호를 공개 저장소에 넣지 않으려고 서버 설정으로 받는다.
   * 다 들어간 뒤에는 지운다(지운 내선이 다시 생기지 않게).
   */
  async onModuleInit() {
    const raw = process.env.CS_EXTENSIONS_SEED;
    if (!raw) return;
    try {
      const have = new Set(
        (await this.prisma.csTransferTarget.findMany({ select: { number: true } })).map(
          (x) => x.number,
        ),
      );
      const max = await this.prisma.csTransferTarget.aggregate({ _max: { sortOrder: true } });
      const rows = (JSON.parse(raw) as SeedRow[]).filter(
        (r) => r.label && digits(r.number).length >= 7 && !have.has(digits(r.number)),
      );
      if (!rows.length) return;
      const base = (max._max.sortOrder ?? -1) + 1;
      await this.prisma.csTransferTarget.createMany({
        data: rows.map((r, i) => ({
          label: r.label.trim(),
          dept: r.dept?.trim() || null,
          extNo: r.extNo?.trim() || null,
          number: digits(r.number),
          sortOrder: base + i,
        })),
      });
      this.logger.log(`내선 ${rows.length}개를 더했습니다(CS_EXTENSIONS_SEED)`);
    } catch (e) {
      this.logger.warn(`CS_EXTENSIONS_SEED를 읽지 못했습니다: ${(e as Error).message}`);
    }
  }

  /** 내선 목록 — 상담원(돌려주기)과 내선 관리자 */
  @Get('cs-transfer-targets')
  list(@CurrentUser() user: AuthPrincipal) {
    if (!has(user, 'LEAD.CREATE', 'CS_CALL.EXTENSIONS'))
      throw new ForbiddenException('내선 목록을 볼 권한이 없습니다.');
    return this.prisma.csTransferTarget.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, dept: true, extNo: true, number: true, memo: true },
    });
  }

  @Post('cs-transfer-targets')
  async save(@CurrentUser() user: AuthPrincipal, @Body() dto: TargetDto) {
    assertManager(user);
    const number = digits(dto.number);
    if (number.length < 7) throw new BadRequestException('번호를 확인해 주세요.');
    const data = {
      label: dto.label.trim(),
      dept: dto.dept?.trim() || null,
      extNo: dto.extNo?.trim() || null,
      number,
      memo: dto.memo?.trim() || null,
    };
    if (dto.id) return this.prisma.csTransferTarget.update({ where: { id: dto.id }, data });
    const max = await this.prisma.csTransferTarget.aggregate({ _max: { sortOrder: true } });
    return this.prisma.csTransferTarget.create({
      data: { ...data, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  @Delete('cs-transfer-targets/:id')
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
