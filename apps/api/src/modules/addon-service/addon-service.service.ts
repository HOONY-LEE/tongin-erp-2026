import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AddonService } from '@prisma/client';
import type { OptionVariant } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import { CreateAddonServiceDto } from './dto/create-addon-service.dto';
import { UpdateAddonServiceDto } from './dto/update-addon-service.dto';

/** 화면용 — 종류를 "일반, 프리미엄" 글자로도 준다(수정 폼 초기값) */
const withText = (a: AddonService) => ({
  ...a,
  variantText: ((a.variants as OptionVariant[] | null) ?? []).map((v) => v.label).join(', '),
});

/**
 * 옵션(부가서비스) 카탈로그 — 견적 3단계 옵션 목록의 원본.
 * 코드는 서버 발급(OPT-0001), 이름은 중복 불가, 견적에 쓰인 옵션은 삭제 대신 '사용 안 함'.
 */
@Injectable()
export class AddonServiceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(activeOnly = false) {
    const rows = await this.prisma.addonService.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(withText);
  }

  async findOne(id: string) {
    const found = await this.prisma.addonService.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`옵션을 찾을 수 없습니다: ${id}`);
    return withText(found);
  }

  async create(dto: CreateAddonServiceDto) {
    const name = normalizeName(dto.name);
    await this.assertNameFree(name);
    const { variantText, ...rest } = dto;
    // 순서를 안 정하면 맨 뒤로
    const sortOrder =
      dto.sortOrder ??
      ((await this.prisma.addonService.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
        0) + 10;
    const created = await createWithCode(
      (prefix) =>
        this.prisma.addonService.findMany({
          where: { code: { startsWith: prefix } },
          select: { code: true },
        }),
      'OPT',
      (code) =>
        this.prisma.addonService.create({
          data: { ...rest, name, code, sortOrder, variants: toVariants(variantText, null) },
        }),
    );
    return withText(created);
  }

  async update(id: string, dto: UpdateAddonServiceDto) {
    const current = await this.findOne(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertNameFree(name, id);
    const { variantText, ...rest } = dto;
    const updated = await this.prisma.addonService.update({
      where: { id },
      data: {
        ...rest,
        name,
        // 순서를 지우면(null) 그대로 둔다 — 비울 수 없는 칸
        sortOrder: rest.sortOrder ?? undefined,
        ...(variantText === undefined
          ? {}
          : { variants: toVariants(variantText, current.variants as OptionVariant[] | null) }),
      },
    });
    return withText(updated);
  }

  /** 견적에 들어간 옵션은 지우지 않는다(견적서가 깨짐). 상품 연결은 함께 풀린다 */
  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.estimateAddon.count({ where: { addonServiceId: id } });
    if (used) {
      throw new ConflictException(
        `견적 ${used}건에서 쓰는 옵션이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.`,
      );
    }
    return this.prisma.addonService.delete({ where: { id } });
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.addonService.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 옵션이 있습니다: ${name}`);
  }
}

/**
 * "일반, 프리미엄" → [{value,label}]. 이미 있던 종류는 value를 그대로 둔다 —
 * 저장된 견적이 종류를 value로 기억하므로, 이름만 같으면 기존 견적과 계속 맞물린다.
 */
function toVariants(
  text: string | undefined,
  current: OptionVariant[] | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const labels = [
    ...new Set(
      (text ?? '')
        .split(',')
        .map((l) => normalizeName(l))
        .filter(Boolean),
    ),
  ];
  if (!labels.length) return Prisma.DbNull;
  return labels.map(
    (label) => current?.find((v) => v.label === label) ?? { value: label, label },
  ) as unknown as Prisma.InputJsonValue;
}
