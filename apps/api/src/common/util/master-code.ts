import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * 마스터 코드 자동 발급 — 사용자는 이름으로 찾고 쓰므로 코드는 시스템이 붙인다.
 * PREFIX-0001 형식으로, 같은 접두어 코드 중 가장 큰 번호 + 1.
 * (예전 데이터의 P-HOME 같은 수기 코드는 번호가 없으니 건너뛴다)
 */
export async function nextCode(
  findCodes: (prefix: string) => Promise<{ code: string }[]>,
  prefix: string,
): Promise<string> {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = (await findCodes(`${prefix}-`)).reduce((m, { code }) => {
    const n = Number(re.exec(code)?.[1] ?? 0);
    return n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 코드를 발급해 저장한다. 동시에 같은 번호를 받은 경우(유니크 충돌)만 다시 발급해 재시도.
 */
export async function createWithCode<T>(
  findCodes: (prefix: string) => Promise<{ code: string }[]>,
  prefix: string,
  create: (code: string) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 3; i++) {
    const code = await nextCode(findCodes, prefix);
    try {
      return await create(code);
    } catch (e) {
      const target = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
      const codeClash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        String(target).includes('code');
      if (!codeClash) throw e;
    }
  }
  throw new ConflictException('코드 발급이 겹쳤습니다. 다시 시도해 주세요.');
}

/** 이름 비교용 — 앞뒤 공백·연속 공백 차이는 같은 이름으로 본다 */
export const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ');
