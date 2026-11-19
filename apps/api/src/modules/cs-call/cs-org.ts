import type { Prisma } from '@prisma/client';

/** 고객관리부(하위 조직 포함) — 상담원 조직. PC 전화·상담 가능·상담원 현황은 이 조직만 */
export const CS_ORG: Prisma.OrgUnitWhereInput = {
  OR: [{ code: 'DEPT-CS' }, { parent: { code: 'DEPT-CS' } }],
};
