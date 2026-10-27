import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { nextEmpNo, withEmpNoRetry } from './emp-no';

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgUnitId?: string) {
    return this.prisma.employee.findMany({
      where: orgUnitId ? { orgUnitId } : undefined,
      include: { position: { select: { name: true, sortOrder: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.employee.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`직원을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateEmployeeDto) {
    const hireDate = toDate(dto.hireDate);
    try {
      return await withEmpNoRetry(async () =>
        this.prisma.employee.create({
          data: {
            ...dto,
            hireDate,
            empNo: dto.empNo?.trim() || (await nextEmpNo(this.prisma, hireDate)),
          },
        }),
      );
    } catch (e) {
      throw this.mapError(e, dto.empNo);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.employee.update({
        where: { id },
        data: {
          ...dto,
          empNo: dto.empNo?.trim() || undefined, // 비워도 이미 매긴 사번은 그대로 둔다
          hireDate: dto.hireDate === undefined ? undefined : toDate(dto.hireDate),
        },
      });
    } catch (e) {
      throw this.mapError(e, dto.empNo);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.employee.delete({ where: { id } });
  }

  private mapError(e: unknown, empNo?: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException(`이미 존재하는 사번입니다: ${empNo}`);
      if (e.code === 'P2003')
        return new BadRequestException('소속 지점이나 직책을 목록에서 다시 골라 주세요.');
    }
    return e as Error;
  }
}

/** 'YYYY-MM-DD' → Date(없으면 null) */
export function toDate(v?: string | null) {
  return v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null;
}
