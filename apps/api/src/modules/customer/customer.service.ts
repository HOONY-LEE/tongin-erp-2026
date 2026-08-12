import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 고객은 담당 지점(ownerOrgId) 기준. 아직 지점이 배정되지 않은 고객(null)은
   * 누구에게도 막지 않는다 — 접수/견적에서 선택할 수 있어야 하기 때문.
   */
  private async scopeWhere(principal?: AuthPrincipal): Promise<Prisma.CustomerWhereInput | null> {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null) return null;
    return { OR: [{ ownerOrgId: { in: ids } }, { ownerOrgId: null }] };
  }

  private async assertScope(ownerOrgId: string | null, principal?: AuthPrincipal) {
    const ids = await this.scope.orgScopeIds(principal);
    if (ids === null || ownerOrgId === null) return;
    if (!ids.includes(ownerOrgId)) {
      throw new ForbiddenException('소속 지점의 고객만 다룰 수 있습니다.');
    }
  }

  async findAll(phone?: string, principal?: AuthPrincipal) {
    const scoped = await this.scopeWhere(principal);
    return this.prisma.customer.findMany({
      where: {
        ...(phone ? { phonePrimary: phone } : {}),
        ...(scoped ?? {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, principal?: AuthPrincipal) {
    const found = await this.prisma.customer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`고객을 찾을 수 없습니다: ${id}`);
    await this.assertScope(found.ownerOrgId, principal);
    return found;
  }

  async create(dto: CreateCustomerDto, principal?: AuthPrincipal) {
    await this.assertScope(dto.ownerOrgId ?? null, principal);
    try {
      return await this.prisma.customer.create({ data: dto });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: string, dto: UpdateCustomerDto, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    if (dto.ownerOrgId !== undefined) await this.assertScope(dto.ownerOrgId ?? null, principal);
    try {
      return await this.prisma.customer.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: string, principal?: AuthPrincipal) {
    await this.findOne(id, principal);
    return this.prisma.customer.delete({ where: { id } });
  }

  private mapError(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return new BadRequestException('존재하지 않는 조직단위(ownerOrgId)입니다.');
    }
    return e as Error;
  }
}
