import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * 문서 번호 — 접두어 2자 + YYMMDD(한국 날짜) + 날짜별 일련 4자리. 예: RC2611200001
 * 접두어: 콜 CL · 접수 RC · 견적 ES · 계약 CT · 작업 WO · 청구 IV · 자재 MO · 부가서비스 SV · A/S AS · CS CS
 * (고객 CU000001, 콜 번호는 DB 트리거가 붙인다). 번호는 DB 함수 next_doc_no가 키별 카운터를 올려 겹치지 않는다.
 */
export type DocPrefix = 'RC' | 'ES' | 'CT' | 'WO' | 'IV' | 'MO' | 'SV' | 'AS' | 'CS';

@Injectable()
export class DocNoService {
  constructor(private readonly prisma: PrismaService) {}

  async next(prefix: DocPrefix): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ no: string }[]>`SELECT next_doc_no(${prefix}) AS no`;
    return rows[0].no;
  }
}
