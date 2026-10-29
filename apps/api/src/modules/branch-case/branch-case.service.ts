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
import { dateOrNull } from '../../common/util/perm';
import { CreateBranchCaseDto, UpdateBranchCaseDto } from './dto/branch-case.dto';

const include = {
  branch: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, orgUnit: { select: { name: true } } } },
} satisfies Prisma.BranchCaseInclude;

/**
 * 지점 관리 기록(가맹팀) — 지점별 현장점검·불법영업·보험처리·소송·재계약·민원.
 * 데이터 범위가 소속 조직이면 그 지점(+하위) 기록만 보고 쓴다(ScopeService).
 */
@Injectable()
export class BranchCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async findAll(
    p: AuthPrincipal,
    f: { branchId?: string; kind?: string; status?: string; q?: string },
  ) {
    const ids = await this.scope.orgScopeIds(p);
    const term = f.q?.trim();
    return this.prisma.branchCase.findMany({
      where: {
        AND: [
          ids === null ? {} : { branchId: { in: ids } },
          f.branchId ? { branchId: f.branchId } : {},
          f.kind ? { kind: f.kind } : {},
          f.status ? { status: f.status } : {},
          term
            ? {
                OR: [
                  { title: { contains: term, mode: 'insensitive' } },
                  { content: { contains: term, mode: 'insensitive' } },
                  { branch: { name: { contains: term, mode: 'insensitive' } } },
                ],
              }
            : {},
        ],
      },
      include,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async findOne(p: AuthPrincipal, id: string) {
    const row = await this.prisma.branchCase.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('지점 관리 기록을 찾을 수 없습니다.');
    const ids = await this.scope.orgScopeIds(p);
    if (ids !== null && !ids.includes(row.branchId)) {
      throw new ForbiddenException('소속 지점의 기록만 볼 수 있습니다.');
    }
    return row;
  }

  /** 지점(BRANCH)만, 그리고 내 범위 안 지점으로만 */
  private async checkBranch(p: AuthPrincipal, branchId: string) {
    const org = await this.prisma.orgUnit.findUnique({ where: { id: branchId } });
    if (!org || org.type !== 'BRANCH') throw new BadRequestException('지점만 고를 수 있습니다.');
    const ids = await this.scope.orgScopeIds(p);
    if (ids !== null && !ids.includes(branchId)) {
      throw new ForbiddenException('소속 지점으로만 기록할 수 있습니다.');
    }
  }

  private async data(dto: UpdateBranchCaseDto) {
    if (dto.assigneeEmpId) {
      const e = await this.prisma.employee.findUnique({ where: { id: dto.assigneeEmpId } });
      if (!e) throw new BadRequestException('없는 직원입니다.');
    }
    return {
      branchId: dto.branchId,
      kind: dto.kind,
      title: dto.title?.trim(),
      content: dto.content,
      status: dto.status,
      occurredAt: dateOrNull(dto.occurredAt) ?? undefined,
      dueDate: dateOrNull(dto.dueDate),
      assigneeEmpId: dto.assigneeEmpId,
      amount: dto.amount,
    };
  }

  async create(p: AuthPrincipal, dto: CreateBranchCaseDto) {
    await this.checkBranch(p, dto.branchId);
    const data = await this.data(dto);
    return this.prisma.branchCase.create({
      data: {
        ...data,
        branchId: dto.branchId,
        kind: dto.kind,
        title: dto.title.trim(),
        occurredAt: dateOrNull(dto.occurredAt) as Date,
        createdByUserId: p.userId,
      },
      include,
    });
  }

  async update(p: AuthPrincipal, id: string, dto: UpdateBranchCaseDto) {
    await this.findOne(p, id);
    if (dto.branchId) await this.checkBranch(p, dto.branchId);
    return this.prisma.branchCase.update({ where: { id }, data: await this.data(dto), include });
  }

  async remove(p: AuthPrincipal, id: string) {
    await this.findOne(p, id);
    await this.prisma.branchCase.delete({ where: { id } });
    return { ok: true };
  }
}
