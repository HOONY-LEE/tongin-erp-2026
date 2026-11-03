import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, SpaceReservation } from '@prisma/client';
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

const KST = 9 * 3600_000;
/** 한 번에 읽는 기간 최대(일) */
const RANGE_MAX_DAYS = 62;

export interface SpaceInput {
  name?: string;
  kind?: 'MEETING' | 'RENTAL';
  location?: string | null;
  capacity?: number | null;
  facilities?: string[];
  color?: string;
  hourlyFee?: number | null;
  openHour?: number;
  closeHour?: number;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ReservationInput {
  spaceId?: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  attendeeEmpIds?: string[];
  description?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  headcount?: number | null;
  fee?: number | null;
  paid?: boolean;
}

/** 한국 시각의 '시'(소수 — 9:30 = 9.5) */
const kstHour = (d: Date) => {
  const k = new Date(d.getTime() + KST);
  return k.getUTCHours() + k.getUTCMinutes() / 60;
};
const kstDay = (d: Date) => new Date(d.getTime() + KST).toISOString().slice(0, 10);

/**
 * 공간 예약 — 회의실(사내)과 대여 공간(파티룸 등 외부 고객).
 * 누구나(로그인) 예약하고 내 예약을 고치거나 취소한다. SPACE.MANAGE는 공간 관리, 남의 예약, 대여 고객 정보.
 */
@Injectable()
export class SpaceService {
  constructor(private readonly prisma: PrismaService) {}

  isManager(p: AuthPrincipal) {
    return p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('SPACE.MANAGE');
  }

  // ── 공간 ──

  spaces(p: AuthPrincipal, all = false) {
    return this.prisma.space.findMany({
      where: all && this.isManager(p) ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  private cleanSpace(dto: SpaceInput, partial: boolean): Prisma.SpaceUncheckedCreateInput {
    const name = dto.name?.trim();
    if (!partial && !name) throw new BadRequestException('공간 이름을 넣어 주세요.');
    const open = dto.openHour;
    const close = dto.closeHour;
    if (open !== undefined && close !== undefined && open >= close)
      throw new BadRequestException('예약 받는 시간은 시작이 끝보다 빨라야 합니다.');
    return {
      ...(name ? { name: name.slice(0, 60) } : {}),
      ...(dto.kind ? { kind: dto.kind } : {}),
      ...(dto.location !== undefined
        ? { location: dto.location?.trim().slice(0, 60) || null }
        : {}),
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.facilities
        ? {
            facilities: [
              ...new Set(dto.facilities.map((f) => f.trim().slice(0, 20)).filter(Boolean)),
            ].slice(0, 12),
          }
        : {}),
      ...(dto.color ? { color: dto.color } : {}),
      ...(dto.hourlyFee !== undefined ? { hourlyFee: dto.hourlyFee } : {}),
      ...(open !== undefined ? { openHour: open } : {}),
      ...(close !== undefined ? { closeHour: close } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim().slice(0, 300) || null }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    } as Prisma.SpaceUncheckedCreateInput;
  }

  createSpace(dto: SpaceInput) {
    return this.prisma.space.create({ data: this.cleanSpace(dto, false) });
  }

  async updateSpace(id: string, dto: SpaceInput) {
    const cur = await this.prisma.space.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('공간을 찾을 수 없습니다.');
    const open = dto.openHour ?? cur.openHour;
    const close = dto.closeHour ?? cur.closeHour;
    if (open >= close)
      throw new BadRequestException('예약 받는 시간은 시작이 끝보다 빨라야 합니다.');
    return this.prisma.space.update({ where: { id }, data: this.cleanSpace(dto, true) });
  }

  /** 예약이 있었던 공간은 지우지 않고 사용 중지한다(기록 보존) */
  async removeSpace(id: string) {
    const used = await this.prisma.spaceReservation.count({ where: { spaceId: id } });
    if (used) {
      await this.prisma.space.update({ where: { id }, data: { isActive: false } });
      return { deactivated: true };
    }
    await this.prisma.space.delete({ where: { id } });
    return { deactivated: false };
  }

  // ── 예약 ──

  async reservations(p: AuthPrincipal, fromStr: string, toStr: string, spaceId?: string) {
    const from = new Date(`${fromStr}T00:00:00+09:00`);
    const to = new Date(`${toStr}T00:00:00+09:00`);
    to.setUTCDate(to.getUTCDate() + 1);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from)
      throw new BadRequestException('기간이 올바르지 않습니다.');
    if (to.getTime() - from.getTime() > RANGE_MAX_DAYS * 86_400_000)
      throw new BadRequestException(`한 번에 ${RANGE_MAX_DAYS}일까지 볼 수 있습니다.`);
    const rows = await this.prisma.spaceReservation.findMany({
      where: {
        status: 'CONFIRMED',
        startAt: { lt: to },
        endAt: { gt: from },
        ...(spaceId ? { spaceId } : {}),
      },
      orderBy: { startAt: 'asc' },
      take: 2000,
    });
    return this.views(rows, p);
  }

  private async views(rows: SpaceReservation[], p: AuthPrincipal) {
    const users = await this.prisma.appUser.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.bookedBy))] } },
      select: {
        id: true,
        loginId: true,
        employee: { select: { name: true, orgUnit: { select: { name: true } } } },
      },
    });
    const empIds = [...new Set(rows.flatMap((r) => r.attendeeEmpIds))];
    const emps = empIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, name: true },
        })
      : [];
    const byUser = new Map(users.map((u) => [u.id, u]));
    const empName = new Map(emps.map((e) => [e.id, e.name]));
    const manager = this.isManager(p);
    return rows.map((r) => {
      const mine = r.bookedBy === p.userId;
      const u = byUser.get(r.bookedBy);
      const seeCustomer = manager || mine;
      return {
        id: r.id,
        spaceId: r.spaceId,
        title: r.title,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        description: r.description,
        bookedBy: r.bookedBy,
        bookedByName: u?.employee?.name ?? u?.loginId ?? '(삭제된 계정)',
        bookedByOrg: u?.employee?.orgUnit?.name ?? null,
        attendees: r.attendeeEmpIds.map((id) => ({ id, name: empName.get(id) ?? '(퇴사)' })),
        // 외부 고객 정보는 관리 권한·예약한 사람만
        customerName: seeCustomer ? r.customerName : r.customerName ? '외부 고객' : null,
        customerPhone: seeCustomer ? r.customerPhone : null,
        headcount: r.headcount,
        fee: seeCustomer ? r.fee : null,
        paid: seeCustomer ? r.paid : null,
        canEdit: mine || manager,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  private async load(id: string) {
    const r = await this.prisma.spaceReservation.findUnique({ where: { id } });
    if (!r || r.status !== 'CONFIRMED') throw new NotFoundException('예약을 찾을 수 없습니다.');
    return r;
  }

  private assertCanEdit(r: SpaceReservation, p: AuthPrincipal) {
    if (r.bookedBy !== p.userId && !this.isManager(p))
      throw new ForbiddenException('내가 한 예약만 고치거나 취소할 수 있습니다.');
  }

  /** 시간·공간 검사 + 겹침 검사(같은 공간 잠금 안에서) 후 저장 */
  private async save(
    p: AuthPrincipal,
    data: {
      spaceId: string;
      title: string;
      startAt: Date;
      endAt: Date;
      attendeeEmpIds: string[];
      description: string | null;
      customerName: string | null;
      customerPhone: string | null;
      headcount: number | null;
      fee: number | null;
      paid: boolean;
    },
    id?: string,
  ) {
    const space = await this.prisma.space.findUnique({ where: { id: data.spaceId } });
    if (!space || !space.isActive) throw new BadRequestException('예약할 수 없는 공간입니다.');
    const { startAt, endAt } = data;
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || endAt <= startAt)
      throw new BadRequestException('끝나는 시간이 시작보다 늦어야 합니다.');
    if (kstDay(startAt) !== kstDay(new Date(endAt.getTime() - 1)))
      throw new BadRequestException(
        '예약은 하루 안에서만 할 수 있습니다. 여러 날이면 나눠서 예약해 주세요.',
      );
    const sh = kstHour(startAt);
    const eh = kstHour(endAt) || 24;
    if (sh < space.openHour || eh > space.closeHour)
      throw new BadRequestException(
        `${space.name}은(는) ${space.openHour}시~${space.closeHour}시에만 예약할 수 있습니다.`,
      );
    if (!id && endAt.getTime() < Date.now())
      throw new BadRequestException('이미 지난 시간은 예약할 수 없습니다.');
    const manager = this.isManager(p);
    const rental = space.kind === 'RENTAL';
    const hours = (endAt.getTime() - startAt.getTime()) / 3600_000;
    const row = {
      spaceId: space.id,
      title: data.title,
      startAt,
      endAt,
      attendeeEmpIds: data.attendeeEmpIds,
      description: data.description,
      headcount: data.headcount,
      // 고객·요금은 관리 권한이 있을 때만 받는다(대여 공간에서만 의미)
      ...(manager && rental
        ? {
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            fee: data.fee ?? (space.hourlyFee ? Math.round(space.hourlyFee * hours) : null),
            paid: data.paid,
          }
        : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      // 같은 공간을 동시에 예약해도 겹치지 않게 — 공간별 잠금
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${space.id}))`;
      const clash = await tx.spaceReservation.findFirst({
        where: {
          spaceId: space.id,
          status: 'CONFIRMED',
          startAt: { lt: endAt },
          endAt: { gt: startAt },
          ...(id ? { id: { not: id } } : {}),
        },
      });
      if (clash) {
        const t = (d: Date) => new Date(d.getTime() + KST).toISOString().slice(11, 16);
        throw new ConflictException(
          `그 시간에 이미 예약이 있습니다(${t(clash.startAt)}~${t(clash.endAt)} ${clash.title}).`,
        );
      }
      return id
        ? tx.spaceReservation.update({ where: { id }, data: row })
        : tx.spaceReservation.create({ data: { ...row, bookedBy: p.userId } });
    });
  }

  private normalize(dto: ReservationInput, base?: SpaceReservation) {
    const title = (dto.title ?? base?.title ?? '').trim();
    if (!title) throw new BadRequestException('예약 이름(용도)을 넣어 주세요.');
    const spaceId = dto.spaceId ?? base?.spaceId;
    if (!spaceId) throw new BadRequestException('공간을 골라 주세요.');
    return {
      spaceId,
      title: title.slice(0, 100),
      startAt: dto.startAt ? new Date(dto.startAt) : base!.startAt,
      endAt: dto.endAt ? new Date(dto.endAt) : base!.endAt,
      attendeeEmpIds: [...new Set(dto.attendeeEmpIds ?? base?.attendeeEmpIds ?? [])].slice(0, 100),
      description:
        dto.description !== undefined
          ? dto.description?.trim().slice(0, 1000) || null
          : (base?.description ?? null),
      customerName:
        dto.customerName !== undefined
          ? dto.customerName?.trim().slice(0, 50) || null
          : (base?.customerName ?? null),
      customerPhone:
        dto.customerPhone !== undefined
          ? dto.customerPhone?.trim().slice(0, 30) || null
          : (base?.customerPhone ?? null),
      headcount: dto.headcount !== undefined ? dto.headcount : (base?.headcount ?? null),
      fee: dto.fee !== undefined ? dto.fee : (base?.fee ?? null),
      paid: dto.paid ?? base?.paid ?? false,
    };
  }

  async create(dto: ReservationInput, p: AuthPrincipal) {
    const r = await this.save(p, this.normalize(dto));
    return (await this.views([r], p))[0];
  }

  async update(id: string, dto: ReservationInput, p: AuthPrincipal) {
    const cur = await this.load(id);
    this.assertCanEdit(cur, p);
    const r = await this.save(p, this.normalize(dto, cur), id);
    return (await this.views([r], p))[0];
  }

  async cancel(id: string, p: AuthPrincipal) {
    const cur = await this.load(id);
    this.assertCanEdit(cur, p);
    await this.prisma.spaceReservation.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: p.userId },
    });
  }
}
