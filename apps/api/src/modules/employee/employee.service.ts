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

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgUnitId?: string) {
    return this.prisma.employee.findMany({
      where: orgUnitId ? { orgUnitId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.employee.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`직원을 찾을 수 없습니다: ${id}`);
    return found;
  }

  async create(dto: CreateEmployeeDto) {
    try {
      return await this.prisma.employee.create({ data: dto });
    } catch (e) {
      throw this.mapError(e, dto.empNo);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.employee.update({ where: { id }, data: dto });
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
        return new BadRequestException('존재하지 않는 조직단위(orgUnitId)입니다.');
    }
    return e as Error;
  }
}
