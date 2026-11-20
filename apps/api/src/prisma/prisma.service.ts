import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * 응답·감사 기록으로 새어 나가면 안 되는 열은 기본으로 읽지 않는다 — 꼭 필요한 곳만 `omit: { 열: false }`로 다시 읽는다.
 * - payment.pgSecret: 토스 입금 웹훅 검증값(알면 누구나 '입금 완료'를 꾸밀 수 있다)
 * - contract.signToken: 고객 서명 링크(알면 고객 대신 서명할 수 있다)
 * - contract.signatureImage: 고객 서명 그림
 * - contractRevision.docBytes: 계약서 수정 이력 문서(HTML) — 문서 보기에서만 따로 읽는다
 * - employee.photoBytes: 프로필 사진 내용(목록 응답이 무거워진다 — 사진은 /employees/:id/photo로 따로)
 */
export const PRISMA_OMIT = {
  payment: { pgSecret: true },
  contract: { signToken: true, signatureImage: true },
  employee: { photoBytes: true },
  contractRevision: { docBytes: true },
} as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ omit: PRISMA_OMIT });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
