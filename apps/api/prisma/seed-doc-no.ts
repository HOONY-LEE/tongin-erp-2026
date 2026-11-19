import type { PrismaClient } from '@prisma/client';

/** 시드용 문서 번호 — 앱과 같은 DB 함수(next_doc_no). at이 있으면 그 날짜(한국)로 */
export async function docNo(prisma: PrismaClient, prefix: string, at?: Date): Promise<string> {
  const rows = await prisma.$queryRaw<{ no: string }[]>`
    SELECT next_doc_no(${prefix}, ((${at ?? new Date()})::timestamptz AT TIME ZONE 'Asia/Seoul')::date) AS no`;
  return rows[0].no;
}
