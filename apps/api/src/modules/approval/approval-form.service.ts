import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_FORM_AUDIENCE,
  FORM_ICONS,
  FORM_MAX_FIELDS,
  DEFAULT_LEAVE_FORM_SETTINGS,
  FORM_FIELD_TYPES,
  PERMISSION_WILDCARD,
  type ApprovalLineRule,
  type FormAudience,
  type FormFile,
  SUBSTITUTE_MODES,
  type ApprovalLineEntry,
  type AuthPrincipal,
  type FormField,
  type FormValue,
  type LeaveFormSettings,
} from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { ApprovalService } from './approval.service';
import { ApprovalAttachmentService } from './approval-attachment.service';

const FIELD_ID = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FIELDS = FORM_MAX_FIELDS;

type FormRow = Prisma.ApprovalFormGetPayload<object>;

const audienceOf = (f: FormRow): FormAudience => {
  const a = ((f.settings as { audience?: Partial<FormAudience> }) ?? {}).audience;
  return {
    mode: a?.mode === 'SOME' ? 'SOME' : 'ALL',
    orgIds: Array.isArray(a?.orgIds) ? a.orgIds : [],
    employeeIds: Array.isArray(a?.employeeIds) ? a.employeeIds : [],
  };
};

/** 기본 결재선 열쇠 — 휴가 신청서는 휴가(LEAVE), 결재 양식은 FORM:<id> */
const lineKeyOf = (f: { id: string; kind: string }) =>
  f.kind === 'LEAVE' ? 'LEAVE' : `FORM:${f.id}`;

const view = (f: FormRow) => ({
  id: f.id,
  kind: f.kind,
  name: f.name,
  category: f.category,
  description: f.description,
  fields: (f.fields as unknown as FormField[]) ?? [],
  settings:
    f.kind === 'LEAVE'
      ? { ...DEFAULT_LEAVE_FORM_SETTINGS, ...((f.settings as object) ?? {}) }
      : ((f.settings as object) ?? {}),
  audience: f.kind === 'CUSTOM' ? audienceOf(f) : DEFAULT_FORM_AUDIENCE,
  icon:
    ((f.settings as { icon?: string }) ?? {}).icon ?? (f.kind === 'LEAVE' ? 'CalendarOff' : null),
  isActive: f.isActive,
  sortOrder: f.sortOrder,
  updatedAt: f.updatedAt,
});

export interface FormInput {
  name?: string;
  category?: string | null;
  description?: string | null;
  fields?: FormField[];
  settings?: Partial<LeaveFormSettings>;
  audience?: FormAudience;
  icon?: string | null;
  line?: ApprovalLineRule[];
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * 결재 양식 — 관리자(APPROVAL.MANAGE)가 항목을 정의하고, 직원이 채워 상신한다.
 * 문서에는 그때의 항목 정의와 값을 함께 남긴다(나중에 양식을 고쳐도 옛 문서는 그대로 보인다).
 */
@Injectable()
export class ApprovalFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly files: ApprovalAttachmentService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 상신할 수 있는 양식(사용 중, 이 사람에게 공개된 것) — 관리 화면은 all=true로 꺼진 것·휴가 신청서·모든 대상까지
   */
  async list(p: AuthPrincipal, all: boolean) {
    const rows = await this.prisma.approvalForm.findMany({
      where: all ? {} : { kind: 'CUSTOM', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (all) return rows.map(view);
    const out: ReturnType<typeof view>[] = [];
    for (const r of rows) if (await this.canUse(p, audienceOf(r))) out.push(view(r));
    return out;
  }

  /** 이 사람이 이 양식을 고를 수 있나 — 전 직원, 또는 고른 조직(하위 포함)·직원. 관리자는 늘 */
  private async canUse(p: AuthPrincipal, a: FormAudience) {
    if (a.mode === 'ALL') return true;
    if (p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('APPROVAL.MANAGE'))
      return true;
    if (p.employeeId && a.employeeIds.includes(p.employeeId)) return true;
    if (!p.employeeOrgUnitId || !a.orgIds.length) return false;
    const orgs = await this.scope.withDescendants(a.orgIds);
    return orgs.includes(p.employeeOrgUnitId);
  }

  /** 관리 화면용 — 양식 + 전사 기본 결재선 */
  async detail(id: string) {
    const f = await this.get(id);
    return { ...f, line: await this.approvals.formLine(lineKeyOf(f)) };
  }

  async get(id: string) {
    const f = await this.prisma.approvalForm.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('결재 양식을 찾을 수 없습니다.');
    return view(f);
  }

  /** 휴가 신청서(하나뿐) — 없으면 기본값으로 만든다 */
  async leaveForm() {
    const f =
      (await this.prisma.approvalForm.findFirst({ where: { kind: 'LEAVE' } })) ??
      (await this.prisma.approvalForm.create({
        data: {
          kind: 'LEAVE',
          name: '휴가 신청서',
          category: '인사',
          sortOrder: 0,
          settings: DEFAULT_LEAVE_FORM_SETTINGS as unknown as Prisma.InputJsonValue,
        },
      }));
    return view(f);
  }

  // ── 관리 ──

  private cleanFields(fields: FormField[]): FormField[] {
    if (fields.length > MAX_FIELDS)
      throw new BadRequestException(`항목은 ${MAX_FIELDS}개까지 둘 수 있습니다.`);
    const ids = new Set<string>();
    return fields.map((f, i) => {
      const label = String(f.label ?? '').trim();
      if (!label) throw new BadRequestException(`${i + 1}번째 항목의 이름을 적어 주세요.`);
      if (label.length > 50) throw new BadRequestException(`항목 이름은 50자까지입니다(${label}).`);
      if (!FORM_FIELD_TYPES.includes(f.type))
        throw new BadRequestException(`'${label}' 항목의 종류가 올바르지 않습니다.`);
      const id = FIELD_ID.test(f.id ?? '') ? f.id : `f${i + 1}`;
      if (ids.has(id)) throw new BadRequestException(`항목 id가 겹칩니다(${id}).`);
      ids.add(id);
      const out: FormField = { id, label, type: f.type, required: !!f.required };
      if (f.type === 'select' || f.type === 'multiselect') {
        const options = [
          ...new Set((f.options ?? []).map((o) => String(o).trim()).filter(Boolean)),
        ];
        if (!options.length)
          throw new BadRequestException(`'${label}' 선택 항목에 고를 값을 하나 이상 넣어 주세요.`);
        if (options.length > 30 || options.some((o) => o.length > 50))
          throw new BadRequestException(`'${label}' 선택지는 30개·각 50자까지입니다.`);
        out.options = options;
      }
      const help = f.help?.trim();
      if (help) out.help = help.slice(0, 200);
      const ph = f.placeholder?.trim();
      if (ph) out.placeholder = ph.slice(0, 100);
      return out;
    });
  }

  private cleanLeaveSettings(s: Partial<LeaveFormSettings> | undefined, cur: LeaveFormSettings) {
    const next = { ...cur, ...(s ?? {}) };
    if (!SUBSTITUTE_MODES.includes(next.substitute))
      throw new BadRequestException('업무 대리인 설정이 올바르지 않습니다.');
    return { substitute: next.substitute, reasonRequired: !!next.reasonRequired };
  }

  async create(p: AuthPrincipal, input: FormInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('양식 이름을 적어 주세요.');
    const row = await this.prisma.$transaction(async (tx) => {
      const row = await tx.approvalForm.create({
        data: {
          kind: 'CUSTOM',
          name: name.slice(0, 60),
          category: input.category?.trim() || null,
          description: input.description?.trim() || null,
          fields: this.cleanFields(input.fields ?? []) as unknown as Prisma.InputJsonValue,
          settings: {
            audience: this.cleanAudience(input.audience),
            ...(input.icon ? { icon: this.cleanIcon(input.icon) } : {}),
          } as unknown as Prisma.InputJsonValue,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 100,
          createdBy: p.userId,
        },
      });
      if (input.line) await this.approvals.setFormLine(tx, lineKeyOf(row), row.name, input.line);
      return row;
    });
    return this.detail(row.id);
  }

  private cleanIcon(icon: string): string {
    if (!(FORM_ICONS as readonly string[]).includes(icon))
      throw new BadRequestException('목록에 있는 아이콘을 골라 주세요.');
    return icon;
  }

  private cleanAudience(a: FormAudience | undefined): FormAudience {
    if (!a || a.mode !== 'SOME') return DEFAULT_FORM_AUDIENCE;
    const orgIds = [...new Set(a.orgIds ?? [])];
    const employeeIds = [...new Set(a.employeeIds ?? [])];
    if (!orgIds.length && !employeeIds.length)
      throw new BadRequestException('공개 대상을 고르거나 「전 직원」으로 두세요.');
    return { mode: 'SOME', orgIds, employeeIds };
  }

  async update(id: string, input: FormInput) {
    const cur = await this.get(id);
    const name = input.name === undefined ? undefined : input.name.trim();
    if (name === '') throw new BadRequestException('양식 이름을 적어 주세요.');
    // 설정은 바뀐 것만 덮는다(휴가: 대리인·사유 필수 / 양식: 공개 대상 / 공통: 아이콘)
    const touched =
      (cur.kind === 'LEAVE' && !!input.settings) ||
      (cur.kind === 'CUSTOM' && !!input.audience) ||
      input.icon !== undefined;
    const settings = touched
      ? {
          ...(cur.settings as object),
          ...(cur.kind === 'LEAVE' && input.settings
            ? this.cleanLeaveSettings(input.settings, cur.settings as LeaveFormSettings)
            : {}),
          ...(cur.kind === 'CUSTOM' && input.audience
            ? { audience: this.cleanAudience(input.audience) }
            : {}),
          ...(input.icon !== undefined
            ? { icon: input.icon ? this.cleanIcon(input.icon) : null }
            : {}),
        }
      : undefined;
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.approvalForm.update({
        where: { id },
        data: {
          name: name?.slice(0, 60),
          category: input.category === undefined ? undefined : input.category?.trim() || null,
          description:
            input.description === undefined ? undefined : input.description?.trim() || null,
          fields:
            input.fields === undefined
              ? undefined
              : (this.cleanFields(input.fields) as unknown as Prisma.InputJsonValue),
          settings: settings as unknown as Prisma.InputJsonValue | undefined,
          // 휴가 신청서는 끌 수 없다
          isActive: cur.kind === 'LEAVE' ? undefined : input.isActive,
          sortOrder: input.sortOrder,
        },
      });
      if (input.line) await this.approvals.setFormLine(tx, lineKeyOf(row), row.name, input.line);
    });
    return this.detail(id);
  }

  /** 지우기 — 올린 문서는 양식 정의를 함께 갖고 있어 그대로 보인다. 휴가 신청서는 못 지운다 */
  async remove(id: string) {
    const cur = await this.get(id);
    if (cur.kind === 'LEAVE') throw new BadRequestException('휴가 신청서는 지울 수 없습니다.');
    await this.prisma.$transaction([
      this.prisma.approvalLineTemplate.deleteMany({ where: { docType: `FORM:${id}` } }),
      this.prisma.approvalForm.delete({ where: { id } }),
    ]);
  }

  // ── 값 확인 ──

  /**
   * 채운 값을 항목 정의대로 확인·정리한다(필수·형식). 직원 항목은 id만 받아 이름을 붙여 남긴다.
   * 휴가 신청서의 추가 항목도 여기로 확인한다.
   */
  async cleanValues(
    fields: FormField[],
    raw: Record<string, unknown> | undefined,
    /** 첨부파일 항목이 있으면 — 올린 사람(이 사람이 올린 파일만 받는다) */
    uploaderUserId?: string,
  ): Promise<Record<string, FormValue>> {
    const values = raw ?? {};
    const out: Record<string, FormValue> = {};
    const personIds = new Set<string>();
    for (const f of fields) {
      const v = values[f.id];
      if (f.type === 'person' && Array.isArray(v))
        v.forEach((x) => typeof x === 'string' && personIds.add(x));
    }
    const people = personIds.size
      ? await this.prisma.employee.findMany({
          where: { id: { in: [...personIds] }, isActive: true },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(people.map((e) => [e.id, e.name]));

    for (const f of fields) {
      const v = values[f.id];
      const missing = () => {
        if (f.required) throw new BadRequestException(`'${f.label}'을(를) 채워 주세요.`);
        out[f.id] = null;
      };
      switch (f.type) {
        case 'text': {
          const t = typeof v === 'string' ? v.trim() : '';
          if (!t) {
            missing();
            break;
          }
          const max = 5000;
          if (t.length > max)
            throw new BadRequestException(`'${f.label}'은(는) ${max}자까지입니다.`);
          out[f.id] = t;
          break;
        }
        case 'number':
        case 'money': {
          if (v === null || v === undefined || v === '') {
            missing();
            break;
          }
          const n = Number(String(v).replace(/,/g, ''));
          if (!Number.isFinite(n))
            throw new BadRequestException(`'${f.label}'에 숫자를 넣어 주세요.`);
          if (f.type === 'money' && n < 0)
            throw new BadRequestException(`'${f.label}'은(는) 0원 이상이어야 합니다.`);
          out[f.id] = f.type === 'money' ? Math.round(n) : n;
          break;
        }
        case 'date': {
          if (!v) {
            missing();
            break;
          }
          if (typeof v !== 'string' || !YMD.test(v))
            throw new BadRequestException(`'${f.label}' 날짜 형식이 올바르지 않습니다.`);
          out[f.id] = v;
          break;
        }
        case 'daterange': {
          const r = v as { from?: unknown; to?: unknown } | null | undefined;
          if (!r || (!r.from && !r.to)) {
            missing();
            break;
          }
          const from = String(r.from ?? '');
          const to = String(r.to || r.from || '');
          if (!YMD.test(from) || !YMD.test(to))
            throw new BadRequestException(`'${f.label}' 기간을 시작·끝 날짜로 채워 주세요.`);
          if (to < from)
            throw new BadRequestException(`'${f.label}' 끝 날짜가 시작 날짜보다 빠릅니다.`);
          out[f.id] = { from, to };
          break;
        }
        case 'select': {
          const t = typeof v === 'string' ? v : '';
          if (!t) {
            missing();
            break;
          }
          if (!f.options?.includes(t))
            throw new BadRequestException(`'${f.label}'에서 목록에 있는 값을 골라 주세요.`);
          out[f.id] = t;
          break;
        }
        case 'multiselect': {
          const picked = Array.isArray(v)
            ? [...new Set(v.filter((x): x is string => typeof x === 'string'))]
            : [];
          if (!picked.length) {
            missing();
            break;
          }
          if (picked.some((x) => !f.options?.includes(x)))
            throw new BadRequestException(`'${f.label}'에서 목록에 있는 값만 골라 주세요.`);
          // 선택지 순서대로 남긴다
          out[f.id] = (f.options ?? []).filter((o) => picked.includes(o));
          break;
        }
        case 'checkbox':
          if (f.required && v !== true)
            throw new BadRequestException(`'${f.label}'에 체크해 주세요.`);
          out[f.id] = v === true;
          break;
        case 'person': {
          const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
          const list = [...new Set(ids)].filter((id) => nameOf.has(id));
          if (!list.length) {
            missing();
            break;
          }
          out[f.id] = list.map((id) => ({ id, name: nameOf.get(id)! }));
          break;
        }
        case 'file': {
          if (!uploaderUserId)
            throw new BadRequestException(`'${f.label}' 첨부파일을 받을 수 없습니다.`);
          const list = await this.files.resolve(uploaderUserId, f.label, v);
          if (!list.length) {
            missing();
            break;
          }
          out[f.id] = list;
          break;
        }
      }
    }
    return out;
  }

  /** 값 안의 첨부파일 전부(문서에 붙일 것) */
  attachmentsIn(fields: FormField[], values: Record<string, FormValue>): FormFile[] {
    return fields
      .filter((f) => f.type === 'file')
      .flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as FormFile[]) : []));
  }

  // ── 상신 ──

  async submit(
    p: AuthPrincipal,
    id: string,
    input: { title?: string; values?: Record<string, unknown>; line?: ApprovalLineEntry[] },
  ) {
    if (!p.employeeId)
      throw new ForbiddenException('직원과 연결된 계정만 결재를 올릴 수 있습니다.');
    const form = await this.get(id);
    if (form.kind !== 'CUSTOM' || !form.isActive)
      throw new BadRequestException('지금 쓸 수 없는 양식입니다.');
    if (!(await this.canUse(p, form.audience)))
      throw new ForbiddenException('이 양식을 쓸 수 있는 대상이 아닙니다.');
    const values = await this.cleanValues(form.fields, input.values, p.userId);
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: p.employeeId },
      select: { name: true },
    });
    const title = input.title?.trim() || `${form.name} — ${emp.name}`;
    const doc = await this.prisma.$transaction(async (tx) => {
      const doc = await this.approvals.submit(tx, {
        docType: 'FORM',
        title: title.slice(0, 200),
        payload: { formId: form.id, formName: form.name, fields: form.fields, values },
        requesterEmpId: p.employeeId!,
        line: input.line ?? null,
        lineKey: `FORM:${form.id}`,
      });
      await this.files.link(tx, doc.id, this.attachmentsIn(form.fields, values));
      return doc;
    });
    await this.approvals.announceSubmitted(doc);
    return this.approvals.get(doc.id, p);
  }
}
