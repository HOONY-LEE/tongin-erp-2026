import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HandlingBucket, MoveCatalog } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { createWithCode, normalizeName } from '../../common/util/master-code';
import {
  CreateHandlingMethodDto,
  CreateRoomTemplateDto,
  UpdateHandlingMethodDto,
  UpdateRoomTemplateDto,
} from './dto/move-catalog.dto';

/**
 * 이사물량 카탈로그 — 방 틀(방 + 자주 들어가는 물품)과 처리방법(물량 집계 칸).
 * 견적 물품정보 화면이 이 데이터로 그려진다.
 */
@Injectable()
export class MoveCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 견적 화면용 묶음 ──

  /**
   * 견적 물품정보에 내려줄 카탈로그. '사용 안 함'은 빼되, 이 견적이 이미 쓰는 처리방법은 남긴다.
   */
  async forEstimate(usedHandlings: string[] = []): Promise<MoveCatalog> {
    const [rooms, items, handlings] = await Promise.all([
      this.prisma.roomTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { items: { orderBy: { sortOrder: 'asc' }, select: { cbmItemId: true } } },
      }),
      this.prisma.cbmItem.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, nameEng: true, category: true, cbm: true, ton: true },
      }),
      this.prisma.handlingMethod.findMany({
        where: { OR: [{ isActive: true }, { code: { in: usedHandlings } }] },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { code: true, name: true, bucket: true, isActive: true },
      }),
    ]);
    const active = new Set(items.map((i) => i.id));
    return {
      rooms: rooms.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        nameEng: r.nameEng,
        itemIds: r.items.map((x) => x.cbmItemId).filter((id) => active.has(id)),
      })),
      items: items.map((i) => ({
        ...i,
        cbm: i.cbm == null ? null : String(i.cbm),
        ton: i.ton == null ? null : String(i.ton),
      })),
      handlings: handlings.map((h) => ({ ...h, bucket: h.bucket as HandlingBucket })),
    };
  }

  /** 처리방법 코드 → 물량 칸 */
  async bucketMap(): Promise<Record<string, string>> {
    const rows = await this.prisma.handlingMethod.findMany({
      select: { code: true, bucket: true },
    });
    return Object.fromEntries(rows.map((r) => [r.code, r.bucket]));
  }

  // ── 방 틀 ──

  async listRooms() {
    const rows = await this.prisma.roomTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          select: { cbmItem: { select: { id: true, name: true } } },
        },
      },
    });
    return rows.map(({ items, ...r }) => ({
      ...r,
      itemIds: items.map((i) => i.cbmItem.id),
      itemNames: items.map((i) => i.cbmItem.name),
      itemCount: items.length,
    }));
  }

  private async room(id: string) {
    const r = await this.prisma.roomTemplate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`방을 찾을 수 없습니다: ${id}`);
    return r;
  }

  async createRoom(dto: CreateRoomTemplateDto) {
    const name = normalizeName(dto.name);
    await this.assertRoomNameFree(name);
    const sortOrder =
      dto.sortOrder ??
      ((await this.prisma.roomTemplate.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
        0) + 10;
    return createWithCode(
      (prefix) =>
        this.prisma.roomTemplate.findMany({
          where: { code: { startsWith: prefix } },
          select: { code: true },
        }),
      'ROOM',
      (code) => this.prisma.roomTemplate.create({ data: { ...dto, code, name, sortOrder } }),
    );
  }

  async updateRoom(id: string, dto: UpdateRoomTemplateDto) {
    await this.room(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertRoomNameFree(name, id);
    return this.prisma.roomTemplate.update({
      where: { id },
      data: { ...dto, name, sortOrder: dto.sortOrder ?? undefined },
    });
  }

  /** 견적에 쓰인 방 틀은 지우지 않는다(견적 방이 이 코드를 가리킨다) */
  async removeRoom(id: string) {
    const r = await this.room(id);
    const used = await this.prisma.estimateZone.count({ where: { roomKey: r.code } });
    if (used) {
      throw new ConflictException(
        `견적 ${used}건에서 쓰는 방이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.`,
      );
    }
    await this.prisma.roomTemplate.delete({ where: { id } });
  }

  /** 방에 자주 들어가는 물품 목록을 이 순서로 바꾼다 */
  async setRoomItems(id: string, itemIds: string[]) {
    await this.room(id);
    const ids = [...new Set(itemIds)];
    const found = await this.prisma.cbmItem.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('없는 이사물품이 섞여 있습니다.');
    await this.prisma.$transaction([
      this.prisma.roomTemplateItem.deleteMany({ where: { roomId: id } }),
      this.prisma.roomTemplateItem.createMany({
        data: ids.map((cbmItemId, i) => ({ roomId: id, cbmItemId, sortOrder: (i + 1) * 10 })),
      }),
    ]);
    return (await this.listRooms()).find((r) => r.id === id);
  }

  private async assertRoomNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.roomTemplate.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 방이 있습니다: ${name}`);
  }

  // ── 처리방법 ──

  listHandlings() {
    return this.prisma.handlingMethod.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async handling(id: string) {
    const h = await this.prisma.handlingMethod.findUnique({ where: { id } });
    if (!h) throw new NotFoundException(`처리방법을 찾을 수 없습니다: ${id}`);
    return h;
  }

  async createHandling(dto: CreateHandlingMethodDto) {
    const name = normalizeName(dto.name);
    await this.assertHandlingNameFree(name);
    const sortOrder =
      dto.sortOrder ??
      ((await this.prisma.handlingMethod.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
        0) + 10;
    return createWithCode(
      (prefix) =>
        this.prisma.handlingMethod.findMany({
          where: { code: { startsWith: prefix } },
          select: { code: true },
        }),
      'HDL',
      (code) => this.prisma.handlingMethod.create({ data: { ...dto, code, name, sortOrder } }),
    );
  }

  async updateHandling(id: string, dto: UpdateHandlingMethodDto) {
    await this.handling(id);
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined) await this.assertHandlingNameFree(name, id);
    return this.prisma.handlingMethod.update({
      where: { id },
      data: { ...dto, name, sortOrder: dto.sortOrder ?? undefined },
    });
  }

  async removeHandling(id: string) {
    const h = await this.handling(id);
    const used = await this.prisma.estimateLine.count({ where: { handling: h.code } });
    if (used) {
      throw new ConflictException(
        `견적 물품 ${used}건에서 쓰는 처리방법이라 삭제할 수 없습니다. 더 쓰지 않으려면 '사용 안 함'으로 바꿔 주세요.`,
      );
    }
    await this.prisma.handlingMethod.delete({ where: { id } });
  }

  private async assertHandlingNameFree(name: string, exceptId?: string) {
    const dup = await this.prisma.handlingMethod.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`이미 같은 이름의 처리방법이 있습니다: ${name}`);
  }
}
