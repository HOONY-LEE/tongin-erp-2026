import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CommissionRule } from '@prisma/client';
import type { BranchSettlement, BranchSettlementLine, CommissionCalcType } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommissionRuleDto, UpdateCommissionRuleDto } from './dto/commission-rule.dto';

/**
 * SET-02: 지점 정산/수수료. 수수료 규칙은 데이터(권한=데이터 철학) —
 * 지점×서비스라인×출처로 정률/정액을 정의하고, 우선순위+구체성으로 매칭.
 * 정산 기준액 = SIGNED 계약 총액(totalAmount). 지점·연월별 집계.
 */
@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  listRules() {
    return this.prisma.commissionRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  createRule(dto: CreateCommissionRuleDto) {
    this.validate(dto.calcType, dto.rate, dto.fixedAmount);
    return this.prisma.commissionRule.create({ data: { ...dto } });
  }

  async updateRule(id: string, dto: UpdateCommissionRuleDto) {
    const current = await this.getRule(id);
    const calcType = (dto.calcType ?? current.calcType) as CommissionCalcType;
    const rate = dto.rate ?? (current.rate == null ? undefined : Number(current.rate));
    const fixedAmount =
      dto.fixedAmount ?? (current.fixedAmount == null ? undefined : Number(current.fixedAmount));
    this.validate(calcType, rate, fixedAmount);
    return this.prisma.commissionRule.update({ where: { id }, data: { ...dto } });
  }

  async removeRule(id: string) {
    await this.getRule(id);
    await this.prisma.commissionRule.delete({ where: { id } });
    return { deleted: true };
  }

  /** 특정 지점·연월 정산: SIGNED 계약별 수수료(규칙 매칭) + 합계. */
  async branchSettlement(
    orgUnitId: string,
    year: number,
    month: number,
  ): Promise<BranchSettlement> {
    if (month < 1 || month > 12) throw new BadRequestException('month는 1~12여야 합니다.');
    const org = await this.prisma.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!org) throw new NotFoundException(`조직단위를 찾을 수 없습니다: ${orgUnitId}`);

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const contracts = await this.prisma.contract.findMany({
      where: { orgUnitId, status: 'SIGNED', signedAt: { gte: start, lt: end } },
      include: { customer: true, lead: true, estimate: { include: { product: true } } },
      orderBy: { signedAt: 'asc' },
    });
    const rules = await this.prisma.commissionRule.findMany({ where: { isActive: true } });

    const lines: BranchSettlementLine[] = contracts.map((c) => {
      const serviceLine = c.lead.serviceLine ?? c.estimate.product.serviceLine ?? null;
      const source = c.lead.source ?? null;
      const rule = this.match(rules, orgUnitId, serviceLine, source);
      const base = Number(c.totalAmount);
      let commission = 0;
      if (rule) {
        commission =
          rule.calcType === 'RATE'
            ? Math.round(base * Number(rule.rate ?? 0))
            : Number(rule.fixedAmount ?? 0);
      }
      return {
        contractId: c.id,
        contractNo: c.contractNo,
        customerName: c.customer.name,
        serviceLine,
        source,
        base,
        ruleId: rule?.id ?? null,
        ruleName: rule?.name ?? null,
        calcType: (rule?.calcType ?? null) as CommissionCalcType | null,
        commission,
      };
    });

    return {
      orgUnitId,
      orgUnitName: org.name,
      year,
      month,
      contractCount: lines.length,
      baseTotal: lines.reduce((s, l) => s + l.base, 0),
      commissionTotal: lines.reduce((s, l) => s + l.commission, 0),
      lines,
    };
  }

  /** 매칭: 차원이 null이면 와일드카드. 우선순위 desc → 구체성(비-null 개수) desc. */
  private match(
    rules: CommissionRule[],
    orgUnitId: string,
    serviceLine: string | null,
    source: string | null,
  ): CommissionRule | null {
    const spec = (r: CommissionRule) =>
      (r.orgUnitId ? 1 : 0) + (r.serviceLine ? 1 : 0) + (r.source ? 1 : 0);
    const matched = rules
      .filter(
        (r) =>
          (r.orgUnitId == null || r.orgUnitId === orgUnitId) &&
          (r.serviceLine == null || r.serviceLine === serviceLine) &&
          (r.source == null || r.source === source),
      )
      .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : spec(b) - spec(a)));
    return matched[0] ?? null;
  }

  private async getRule(id: string): Promise<CommissionRule> {
    const r = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`수수료 규칙을 찾을 수 없습니다: ${id}`);
    return r;
  }

  private validate(calcType: CommissionCalcType, rate?: number, fixedAmount?: number) {
    if (calcType === 'RATE' && rate == null) {
      throw new BadRequestException('RATE 규칙은 rate(0~1)가 필요합니다.');
    }
    if (calcType === 'FIXED' && fixedAmount == null) {
      throw new BadRequestException('FIXED 규칙은 fixedAmount가 필요합니다.');
    }
  }
}
