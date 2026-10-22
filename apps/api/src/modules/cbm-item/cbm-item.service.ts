import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import { CreateCbmItemDto } from './dto/create-cbm-item.dto';
import { UpdateCbmItemDto } from './dto/update-cbm-item.dto';

/**
 * 이사물품 사전 — 물품은 이름으로 하나뿐이다. 방 틀은 이 물품을 가리키기만 한다
 * (안방 컴퓨터와 서재 컴퓨터는 같은 물품). 코드는 서버 발급(ITM-0001).
 */
@Injectable()
export class CbmItemService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(category?: string) {
    const rows = await this.prisma.cbmItem.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { rooms: { select: { room: { select: { name: true } } } } },
    });
    // 어느 방 틀에 들어 있는지 — 목록에서 보여 준다
    return rows.map(({ rooms, ...r }) => ({ ...r, roomNames: rooms.map((x) => x.room.name) }));
  }

  async findOne(id: string) {
    const found = await this.prisma.cbmItem.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`이사물품을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateCbmItemDto) {
    const name = normalizeName(dto.name);
    await this.assertNameFree(name);
    return createWithCode(
      (prefix) =>
        this.prisma.cbmItem.findMany({
          where: { code: { startsWith: prefix } },
          select: { code: true },
        }),
      'ITM',
      (code) =>
        this.prisma.cbmItem.create({
          data: { ...dto, code, name, category: normalizeName(dto.category) },
        }),
    );
  }

  async update(id: string, dto: UpdateCbmItemDto) {
    await this.findOne(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertNameFree(name, id);
    return this.prisma.cbmItem.update({
      where: { id },
      data: {
        ...dto,
        name,
        category: dto.category === undefined ? undefined : normalizeName(dto.category),
        // 비울 수 없는 칸
        sortOrder: dto.sortOrder ?? undefined,
      },
    });
  }

  /** 견적 물품에 쓰인 물품은 지우지 않는다 — '사용 안 함'으로. 방 틀 연결은 함께 풀린다 */
  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.estimateLine.count({ where: { cbmItemId: id } });
    if (used) {
      throw new ConflictException(
        `견적 물품 ${used}건에서 쓰는 물품이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.`,
      );
    }
    return this.prisma.cbmItem.delete({ where: { id } });
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.cbmItem.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 이사물품이 있습니다: ${name}`);
  }
}
