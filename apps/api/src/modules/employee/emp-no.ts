import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

/**
 * 사번 자동 생성 — 입사연도 4자리 + 그 해 일련번호 4자리(예: 2026년 첫 입사자 20260001).
 * 입사일이 없으면 오늘 기준. 예전 형식(E1001 등)은 건드리지 않고 같은 형식끼리만 이어 센다.
 */
export async function nextEmpNo(db: Db, hireDate?: Date | null): Promise<string> {
  const year = String((hireDate ?? new Date()).getFullYear());
  const rows = await db.employee.findMany({
    where: { empNo: { startsWith: year } },
    select: { empNo: true },
  });
  const pattern = new RegExp(`^${year}(\\d{4})$`);
  const last = rows.reduce((m, r) => {
    const hit = r.empNo?.match(pattern);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `${year}${String(last + 1).padStart(4, '0')}`;
}

/** 사번이 겹쳐(동시 등록) 실패하면 번호를 다시 매겨 몇 번 더 시도한다. */
export async function withEmpNoRetry<T>(run: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (e) {
      const dup =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        String(e.meta?.target ?? '').includes('emp_no');
      if (!dup || i >= tries - 1) throw e;
    }
  }
}
