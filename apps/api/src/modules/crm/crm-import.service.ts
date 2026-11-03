import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import {
  CRM_PIPELINES,
  PERMISSION_WILDCARD,
  type AuthPrincipal,
  type CrmImportPreview,
  type CrmInterest,
  type CrmPipelineDef,
  type CrmPipelineKey,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface CrmImportInput {
  /** 엑셀·구글 시트에서 복사한 표(탭으로 나뉨) 또는 CSV 글 */
  text?: string;
  /** CSV·xlsx 파일 */
  file?: { name: string; dataBase64: string };
}

const MAX_ROWS = 2000;
const norm = (s: string) => s.replace(/[\s·_\-()/*]/g, '').toLowerCase();
const digits = (s: string) => s.replace(/\D/g, '');

/** 표 머리글 → 항목. 앞에 있는 이름일수록 먼저 맞춘다 */
const BASE_ALIASES: [field: string, names: string[]][] = [
  ['companyName', ['업체명', '회사명', '상호', '기업명', '거래처명', '고객사']],
  ['contactName', ['대표자명', '대표자', '대표', '고객명', '성명', '이름', '사장님', '담당자명']],
  ['contactTitle', ['직함', '직책', '부서', '직위']],
  ['phone', ['대표연락처', '연락처', '전화번호', '전화', '휴대폰', '핸드폰', '휴대전화']],
  ['email', ['담당메일', '이메일', '메일', 'email', 'e-mail']],
  ['region', ['지역', '희망지역', '운영지역', '시도']],
  ['source', ['유입경로', '유입', '경로', '접수경로']],
  ['stage', ['진행상태', '단계', '상태', '영업단계']],
  ['interest', ['관심도', '구매의사', '관심']],
  ['owner', ['담당자', '영업담당', '담당', '영업담당자']],
  ['amount', ['예상거래액', '예상매출', '거래액', '예상금액', '견적액', '가맹비', '예상가맹비']],
  ['nextActionAt', ['다음연락일', '다음팔로업', '다음연락', '팔로업']],
  ['createdAt', ['등록일', '등록일자', '접수일']],
  ['memo', ['비고', '메모', '기타', '특이사항']],
  ['priority', ['우선순위']],
];

const STAGE_HINTS: [RegExp, 'won' | 'lost' | 'hold' | 'contracting' | 'consulting' | 'first'][] = [
  [/계약\s*완료|수주|성사|체결|완료/, 'won'],
  [/실패|거절|드랍|drop|무산|이탈/i, 'lost'],
  [/보류|연기|대기\s*중\s*단|중단/, 'hold'],
  [/계약\s*진행|계약|협상|견적/, 'contracting'],
  // '상담대기'처럼 아직 시작 전이면 첫 단계 — 상담·미팅보다 먼저 본다
  [/대기|신규|발굴|리드|미접촉|접수/, 'first'],
  [/상담|미팅|방문|실사|진행/, 'consulting'],
];

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * 영업 CRM 가져오기 — 엑셀·구글 시트에서 복사한 표나 CSV·xlsx를 읽어 머리글로 항목을 맞추고,
 * 같은 파이프라인에 같은 업체(업체명+연락처)가 있으면 건너뛴다. 먼저 미리보기(dryRun)로 확인한 뒤 넣는다.
 */
@Injectable()
export class CrmImportService {
  constructor(private readonly prisma: PrismaService) {}

  private async table(input: CrmImportInput): Promise<string[][]> {
    if (input.file) {
      const buf = Buffer.from(input.file.dataBase64, 'base64');
      if (buf.length > 10 * 1024 * 1024)
        throw new BadRequestException('10MB보다 큰 파일은 안 됩니다.');
      if (/\.xlsx$/i.test(input.file.name)) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf as unknown as ArrayBuffer);
        const ws = wb.worksheets[0];
        if (!ws) return [];
        const rows: string[][] = [];
        ws.eachRow((row) => {
          rows.push(
            (row.values as unknown[]).slice(1).map((v) => {
              if (v == null) return '';
              if (v instanceof Date) return v.toISOString().slice(0, 10);
              if (typeof v === 'object' && 'text' in (v as object))
                return String((v as { text: unknown }).text);
              if (typeof v === 'object' && 'result' in (v as object))
                return String((v as { result: unknown }).result ?? '');
              return String(v).trim();
            }),
          );
        });
        return rows;
      }
      if (!/\.(csv|tsv|txt)$/i.test(input.file.name))
        throw new BadRequestException('CSV·xlsx 파일만 올릴 수 있습니다.');
      input = { text: buf.toString('utf8').replace(/^\uFEFF/, '') };
    }
    const text = (input.text ?? '').replace(/\r\n?/g, '\n').trim();
    if (!text) return [];
    const lines = text.split('\n').filter((l) => l.trim());
    const sep = lines[0].includes('\t') ? '\t' : ',';
    return lines.map((l) => parseCsvLine(l, sep));
  }

  private mapColumns(def: CrmPipelineDef, headers: string[]) {
    const aliases: [string, string[]][] = [
      ...BASE_ALIASES,
      ...def.fields.map((f): [string, string[]] => [
        `f:${f.key}`,
        [
          f.label,
          ...(f.key === 'employees' ? ['상시근로자', '직원수', '임직원수', '정직원수'] : []),
          ...(f.key === 'fromAddr' ? ['현재주소', '주소', '상세주소', '현재위치'] : []),
          ...(f.key === 'segment' ? ['구분', 'DB구분'] : []),
          ...(f.key === 'trucks' ? ['차량보유대수', '차량', '보유차량'] : []),
          ...(f.key === 'currentBiz' ? ['주요이사유형', '현재사업'] : []),
          ...(f.key === 'homepage' ? ['홈페이지', '웹사이트', 'url'] : []),
        ],
      ]),
    ];
    const used = new Set<string>();
    return headers.map((h) => {
      const n = norm(h);
      for (const [field, names] of aliases) {
        if (used.has(field)) continue;
        if (names.some((x) => norm(x) === n)) {
          used.add(field);
          return field;
        }
      }
      return null;
    });
  }

  private stageOf(def: CrmPipelineDef, raw: string): string {
    const first = def.stages[0].key;
    if (!raw) return first;
    const exact = def.stages.find(
      (s) => s.key === raw.toUpperCase() || norm(s.label) === norm(raw),
    );
    if (exact) return exact.key;
    const hint = STAGE_HINTS.find(([re]) => re.test(raw))?.[1] ?? 'first';
    const open = def.stages.filter((s) => s.open);
    switch (hint) {
      case 'won':
        return def.stages.find((s) => s.won)!.key;
      case 'lost':
        return def.stages.find((s) => s.lost)!.key;
      case 'hold':
        return def.stages.find((s) => !s.open && !s.won && !s.lost)?.key ?? first;
      case 'contracting':
        return open[open.length - 1].key;
      case 'consulting':
        return open.find((s) => s.phase === 'deal')?.key ?? first;
      default:
        return first;
    }
  }

  private interestOf(raw: string, priority: string): CrmInterest {
    const v = `${raw} ${priority}`;
    if (/높|상|^a|\sa\b|hot/i.test(v)) return 'A';
    if (/낮|하|^c|\sc\b|cold/i.test(v)) return 'C';
    return 'B';
  }

  private dateOf(raw: string): Date | null {
    const m = /(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/.exec(raw);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+09:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async run(
    p: AuthPrincipal,
    pipeline: CrmPipelineKey,
    input: CrmImportInput,
    dryRun: boolean,
  ): Promise<CrmImportPreview> {
    const def = CRM_PIPELINES[pipeline];
    if (
      !p.permissions.includes(PERMISSION_WILDCARD) &&
      !p.permissions.includes(`${def.perm}.CREATE`)
    )
      throw new ForbiddenException('영업 대상을 등록할 권한이 없습니다.');
    const table = await this.table(input);
    if (table.length < 2)
      throw new BadRequestException('첫 줄은 머리글, 둘째 줄부터 내용이 있어야 합니다.');
    if (table.length - 1 > MAX_ROWS)
      throw new BadRequestException(`한 번에 ${MAX_ROWS}줄까지 가져올 수 있습니다.`);
    const headers = table[0];
    const fields = this.mapColumns(def, headers);
    if (!fields.includes('companyName'))
      throw new BadRequestException(
        '업체명(회사명·상호) 칸을 찾지 못했습니다. 머리글을 확인해 주세요.',
      );
    const labelOf = (f: string | null) => {
      if (!f) return null;
      if (f.startsWith('f:')) return def.fields.find((x) => x.key === f.slice(2))?.label ?? f;
      const L: Record<string, string> = {
        companyName: def.companyLabel,
        contactName: def.contactLabel,
        contactTitle: '직함',
        phone: '연락처',
        email: '메일',
        region: def.regionLabel,
        source: '유입 경로',
        stage: '단계',
        interest: '관심도',
        owner: '영업 담당',
        amount: def.amountLabel ?? '금액',
        nextActionAt: '다음 연락일',
        createdAt: '등록일',
        memo: '메모',
        priority: '우선순위 → 관심도',
      };
      return L[f] ?? f;
    };

    const people = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const existing = await this.prisma.crmLead.findMany({
      where: { pipeline },
      select: { companyName: true, phone: true },
    });
    // 같은 곳 = 업체명 + 연락처가 같은 것(연락처가 없으면 업체명만). 이름이 같은 '신규' 업체가 여럿이거나
    // 계열사가 대표번호를 함께 쓰는 경우가 있어 한쪽만으로는 가리지 않는다
    const keyOf = (name: string, phone: string) =>
      `${norm(name)}|${phone.length >= 8 ? phone : ''}`;
    const seen = new Set(existing.map((e) => keyOf(e.companyName, digits(e.phone ?? ''))));
    const warnings = new Set<string>();
    const unmatchedOwners = new Set<string>();

    const rows: CrmImportPreview['rows'] = [];
    const toCreate: Prisma.CrmLeadUncheckedCreateInput[] = [];
    for (const r of table.slice(1)) {
      const get = (f: string) => {
        const i = fields.indexOf(f);
        return i >= 0 ? (r[i] ?? '').trim() : '';
      };
      const companyName = get('companyName');
      const phone = digits(get('phone'));
      const ownerRaw = get('owner');
      const owner = ownerRaw ? people.find((x) => x.name === ownerRaw) : undefined;
      if (ownerRaw && !owner) unmatchedOwners.add(ownerRaw);
      const stage = this.stageOf(def, get('stage'));
      const interest = this.interestOf(get('interest'), get('priority'));
      const createdAt = this.dateOf(get('createdAt'));
      const sourceRaw = get('source');
      const source =
        def.sources.find(
          (s) => s.key === sourceRaw.toUpperCase() || norm(s.label) === norm(sourceRaw),
        )?.key ??
        def.sources.find((s) => s.key === 'DB')?.key ??
        def.sources[0].key;
      const extra: Record<string, string> = {};
      fields.forEach((f, i) => {
        if (f?.startsWith('f:') && r[i]?.trim()) extra[f.slice(2)] = r[i].trim();
      });
      const numbers: Record<string, number | string> = { ...extra };
      for (const f of def.fields)
        if (f.type === 'number' && extra[f.key]) {
          const n = Number(digits(extra[f.key]));
          if (n) numbers[f.key] = n;
          else delete numbers[f.key];
        }
      const amount = Number(digits(get('amount'))) || null;
      const memoParts = [
        get('memo'),
        sourceRaw && !def.sources.some((s) => norm(s.label) === norm(sourceRaw))
          ? `유입: ${sourceRaw}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');

      let status: 'create' | 'duplicate' | 'invalid' = 'create';
      if (!companyName) status = 'invalid';
      else if (seen.has(keyOf(companyName, phone))) status = 'duplicate';
      rows.push({
        status,
        companyName: companyName || '(업체명 없음)',
        contactName: get('contactName') || null,
        phone: phone || null,
        region: get('region') || null,
        stage: def.stages.find((s) => s.key === stage)!.label,
        interest,
        ownerName: owner?.name ?? (ownerRaw ? `${ownerRaw}(없는 직원)` : null),
        createdAt: createdAt?.toISOString().slice(0, 10) ?? null,
      });
      if (status !== 'create') continue;
      seen.add(keyOf(companyName, phone));
      const next = this.dateOf(get('nextActionAt'));
      toCreate.push({
        pipeline,
        companyName: companyName.slice(0, 100),
        contactName: get('contactName').slice(0, 50) || null,
        contactTitle: get('contactTitle').slice(0, 50) || null,
        phone: phone || null,
        email: get('email').slice(0, 120) || null,
        region: get('region').slice(0, 100) || null,
        source,
        stage,
        interest,
        ownerEmpId: owner?.id ?? null,
        amount,
        nextActionAt: next ? new Date(`${next.toISOString().slice(0, 10)}T00:00:00Z`) : null,
        memo: memoParts.slice(0, 3000) || null,
        fields: numbers,
        createdByUserId: p.userId,
        ...(createdAt && { createdAt }),
      });
    }
    if (unmatchedOwners.size)
      warnings.add(
        `영업 담당 '${[...unmatchedOwners].join(', ')}'은(는) 직원 명단에 없어 담당 없이 넣습니다.`,
      );
    const unmapped = headers.filter((_, i) => !fields[i]);
    if (unmapped.length) warnings.add(`가져오지 않는 칸: ${unmapped.join(', ')}`);

    let imported: number | undefined;
    if (!dryRun && toCreate.length) {
      // 원격 DB(운영)는 왕복이 느려 기본 5초 트랜잭션 한도를 넘는다 — 상담 기록은 함께 만들고(한 번에) 한도를 넉넉히
      imported = await this.prisma.$transaction(
        async (tx) => {
          for (const data of toCreate)
            await tx.crmLead.create({
              data: {
                ...data,
                activities: {
                  create: {
                    kind: 'STAGE',
                    toStage: data.stage,
                    content: '가져오기로 등록',
                    actorUserId: p.userId,
                    actorName: p.employeeName ?? p.loginId,
                    at: data.createdAt ?? new Date(),
                  },
                },
              },
            });
          return toCreate.length;
        },
        { maxWait: 10_000, timeout: 120_000 },
      );
    }
    return {
      columns: headers.map((h, i) => ({ header: h, field: fields[i], label: labelOf(fields[i]) })),
      total: rows.length,
      create: rows.filter((r) => r.status === 'create').length,
      duplicate: rows.filter((r) => r.status === 'duplicate').length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
      warnings: [...warnings],
      rows: rows.slice(0, 300),
      ...(imported !== undefined && { imported }),
    };
  }
}
