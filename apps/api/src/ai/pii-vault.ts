import { createHash, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AI 가명 처리 — 외부 AI 모델(Anthropic)에는 고객 이름·전화·주소·이메일 대신 가명을 보내고,
 * 실제 값은 우리 DB(ai_pii_token)에만 둔다.
 *
 *   AI로 나가는 것(도구 결과·질문)        → hide: 실제 값 → [[전화:K7Q2M9]] · [[이름:…]] · [[주소:서울 강남구 …]]
 *   AI가 부르는 도구 입력(문자 보내기 등) → reveal: 가명 → 실제 값(그 사람 가명만 풀린다)
 *   화면에 보여 줄 답·AI가 만든 파일     → reveal
 *
 * 사람마다 따로 둔다(남이 받은 가명은 풀 수 없다). 같은 값은 늘 같은 가명이라 AI가 같은 사람을 알아본다.
 * 시·도·시·군·구는 남긴다(지역별 집계·일정 묶기는 그대로 되게). 이름·주소·전화가 어느 칸에 있는지는
 * 칸 이름으로 고르고, 메모·상담 내용 같은 자유 글에서는 전화번호·이메일만 찾아 바꾼다(글 속 이름은 못 찾는다).
 * 끄려면 AI_PSEUDONYMIZE=off.
 */
export type PiiKind = 'PHONE' | 'NAME' | 'ADDR' | 'EMAIL';

const LABEL: Record<PiiKind, string> = {
  PHONE: '전화',
  NAME: '이름',
  ADDR: '주소',
  EMAIL: '이메일',
};

/** 가명 코드 — 헷갈리는 글자(I·L·O·0·1) 뺀 6자 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
/** [[전화:K7Q2M9]] · [[주소:서울 강남구 K7Q2M9]] — 주소는 지역(시·구)을 코드 앞에 남긴다 */
const TOKEN_RE = /\[\[(전화|이름|주소|이메일):(?:[^[\]]*?\s)?([A-HJ-KMNP-Z2-9]{6})\]\]/g;

// 칸 이름으로 고르기
const PHONE_KEY = /(phone|mobile|^tel$|tel$|^to$|recipient$|contactNumber|fax)/i;
const EMAIL_KEY = /email/i;
const ADDR_KEY = /(addr|address)/i;
/** 사람 이름 칸(xxxName) */
const NAME_KEY =
  /^(customer|signer|employee|owner|assignee|requester|recipient|contact|estimator|manager|user|holder|depositor|member|approver|substitute|backup|creator|createdBy|author|driver|leader|staff|person)Name$/i;
/** 이 이름 아래 객체의 name은 사람 이름 */
const PERSON_PARENT =
  /(customer|employee|emp$|Emp$|owner|assignee|estimator|requester|approver|signer|recipient|contact|member|^user$|manager|creator|author|substitute|backup|staff|person|people|crew|worker|driver|leader)/i;
/** 사람 같은 이름이 붙어도 조직·상품 같은 것(ownerOrg·customerGrade·memberRole …) — 그 안의 name은 그대로 */
const NOT_PERSON =
  /(org|unit|branch|team|dept|product|partner|company|role|position|grade|status|type|category|space|group|code)/i;

// 자유 글에서 찾기
const PHONE_IN_TEXT =
  /(?<![\dA-Za-z])(?:\+?82[-.\s]?|0)(?:1[016789]|2|[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g;
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const digits = (s: string) => s.replace(/\D/g, '');
const norm = (kind: PiiKind, v: string) =>
  kind === 'PHONE' ? digits(v) : kind === 'EMAIL' ? v.trim().toLowerCase() : v.trim();
const hashOf = (kind: PiiKind, v: string) =>
  createHash('sha256')
    .update(`${kind}:${norm(kind, v)}`)
    .digest('hex');

/** 서울 용산구 이촌로 62 → '서울 용산구' (시·도 + 시·군·구까지) */
function regionOf(addr: string): string {
  const parts = addr.trim().split(/\s+/);
  if (parts.length <= 1) return '';
  const keep = [parts[0]];
  for (const p of parts.slice(1, 3)) {
    if (/(시|군|구)$/.test(p)) keep.push(p);
    else break;
  }
  return keep.length > 1 ? keep.join(' ') : '';
}

const randomCode = () =>
  Array.from({ length: CODE_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

interface Found {
  kind: PiiKind;
  value: string;
  hash: string;
}

@Injectable()
export class PiiVault {
  constructor(private readonly prisma: PrismaService) {}

  get enabled() {
    return (process.env.AI_PSEUDONYMIZE ?? '').toLowerCase() !== 'off';
  }

  // ── AI로 나가는 쪽 ──

  /**
   * 도구 결과처럼 구조가 있는 값 — 칸 이름으로 전화·이메일·주소·사람 이름을 가명으로, 나머지 글자는 전화·이메일만.
   * rootKey: 맨 위 값이 무엇인지(도구 이름 등) — 'search_customers'면 그 안의 name도 고객 이름으로 본다.
   */
  async hide<T>(userId: string, value: T, rootKey = ''): Promise<T> {
    if (!this.enabled || value === null || value === undefined) return value;
    const found = new Map<string, Found>();
    this.walk(value, rootKey, false, (kind, v) => {
      const hash = hashOf(kind, v);
      if (!found.has(hash)) found.set(hash, { kind, value: v, hash });
    });
    if (!found.size) return value;
    const codes = await this.codesFor(userId, [...found.values()]);
    return this.walk(value, rootKey, false, (kind, v) => {
      const code = codes.get(hashOf(kind, v));
      return code ? this.token(kind, v, code) : v;
    }) as T;
  }

  /** 사람이 쓴 글(질문 등) — 전화번호·이메일만 가명으로(글 속 이름·주소는 찾지 못한다) */
  async hideText(userId: string, text: string): Promise<string> {
    if (!this.enabled || !text) return text;
    return this.hide(userId, text);
  }

  /**
   * 사람이 고친 글(승인 카드에서 고친 문자 본문 등)을 AI에게 다시 알려 줄 때 — 원래 글에 있던 가명의 실제 값이
   * 고친 글에 그대로 들어 있으면 다시 그 가명으로 바꾸고, 전화·이메일도 가린다.
   */
  async rehide(userId: string, edited: string, original: string): Promise<string> {
    if (!this.enabled) return edited;
    const codes = [...original.matchAll(TOKEN_RE)].map((m) => m[2]);
    let out = edited;
    if (codes.length) {
      const rows = await this.prisma.aiPiiToken.findMany({
        where: { userId, code: { in: codes } },
        select: { code: true, kind: true, value: true },
      });
      // 긴 값부터(주소 안의 이름 같은 부분 겹침 방지)
      for (const r of rows.sort((a, b) => b.value.length - a.value.length)) {
        if (r.value) out = out.split(r.value).join(this.token(r.kind as PiiKind, r.value, r.code));
      }
    }
    return this.hideText(userId, out);
  }

  // ── AI에서 들어오는 쪽·화면 ──

  /** 가명 → 실제 값(이 사람 가명만). 모르는 가명은 그대로 둔다 */
  async reveal<T>(userId: string, value: T): Promise<T> {
    if (value === null || value === undefined) return value;
    const codes = new Set<string>();
    this.strings(value, (s) => {
      for (const m of s.matchAll(TOKEN_RE)) codes.add(m[2]);
      return s;
    });
    if (!codes.size) return value;
    const map = await this.valuesFor(userId, [...codes]);
    return this.strings(value, (s) =>
      s.replace(TOKEN_RE, (all, _l, code: string) => map.get(code) ?? all),
    ) as T;
  }

  /**
   * AI가 만든 파일(코드 실행 샌드박스는 가명만 받아 만든다)을 내려받을 때 실제 값으로 —
   * 글자 파일(CSV·TXT·MD·JSON·HTML·XML)과 오피스 파일(XLSX·DOCX·PPTX: 안의 XML). PDF·그림은 그대로.
   */
  async revealFile(
    userId: string,
    name: string,
    mediaType: string,
    bytes: Buffer,
  ): Promise<Buffer> {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    const office = ['xlsx', 'docx', 'pptx'].includes(ext);
    // 오피스 파일 종류(…spreadsheetml…)에도 'xml'이 들어 있어 확장자로 먼저 가른다
    const isText =
      !office &&
      (/^text\//.test(mediaType) ||
        /^application\/(json|xml|csv)/.test(mediaType) ||
        ['csv', 'txt', 'md', 'json', 'html', 'xml'].includes(ext));
    if (isText) {
      const text = bytes.toString('utf8');
      if (!text.includes('[[')) return bytes;
      const csv = ext === 'csv' || /csv/.test(mediaType);
      const out = await this.revealText(
        userId,
        text,
        csv ? 'csv' : ext === 'html' ? 'xml' : 'plain',
      );
      return Buffer.from(out, 'utf8');
    }
    if (office) {
      try {
        const zip = await JSZip.loadAsync(bytes);
        const parts = Object.keys(zip.files).filter((p) => p.endsWith('.xml'));
        let changed = false;
        for (const p of parts) {
          const xml = await zip.file(p)!.async('string');
          if (!xml.includes('[[')) continue;
          const out = await this.revealText(userId, xml, 'xml');
          if (out !== xml) {
            zip.file(p, out);
            changed = true;
          }
        }
        return changed
          ? await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
          : bytes;
      } catch {
        return bytes;
      }
    }
    return bytes;
  }

  // ── 속 ──

  private token(kind: PiiKind, value: string, code: string) {
    const region = kind === 'ADDR' ? regionOf(value) : '';
    return `[[${LABEL[kind]}:${region ? `${region} ` : ''}${code}]]`;
  }

  /** 글자 파일 안 가명 풀기 — XML은 이스케이프, CSV는 칸 하나가 통째로 가명이면 따옴표로 */
  private async revealText(userId: string, text: string, mode: 'plain' | 'xml' | 'csv') {
    const codes = [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[2]))];
    if (!codes.length) return text;
    const map = await this.valuesFor(userId, codes);
    const xmlEsc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return text.replace(TOKEN_RE, (all, _l, code: string, offset: number, whole: string) => {
      const v = map.get(code);
      if (v === undefined) return all;
      if (mode === 'xml') return xmlEsc(v);
      if (mode === 'csv' && /[",\r\n]/.test(v)) {
        const before = whole[offset - 1];
        const after = whole[offset + all.length];
        const wholeCell =
          (before === undefined || before === ',' || before === '\n') &&
          (after === undefined || after === ',' || after === '\r' || after === '\n');
        return wholeCell ? `"${v.replace(/"/g, '""')}"` : v.replace(/[",\r\n]/g, ' ');
      }
      return v;
    });
  }

  /** 값마다 가명 코드(없으면 만든다) — hash → code */
  private async codesFor(userId: string, items: Found[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const load = async (hashes: string[]) => {
      const rows = await this.prisma.aiPiiToken.findMany({
        where: { userId, valueHash: { in: hashes } },
        select: { valueHash: true, code: true },
      });
      for (const r of rows) out.set(r.valueHash, r.code);
    };
    await load(items.map((i) => i.hash));
    // 동시에 같은 값을 만들거나 코드가 우연히 겹치면 건너뛰어지고(skipDuplicates), 다음 바퀴에 다시 읽거나 새 코드로
    for (let round = 0; round < 3; round++) {
      const missing = items.filter((i) => !out.has(i.hash));
      if (!missing.length) break;
      await this.prisma.aiPiiToken.createMany({
        data: missing.map((i) => ({
          userId,
          code: randomCode(),
          kind: i.kind,
          value: i.value,
          valueHash: i.hash,
        })),
        skipDuplicates: true,
      });
      await load(missing.map((i) => i.hash));
    }
    return out;
  }

  private async valuesFor(userId: string, codes: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.aiPiiToken.findMany({
      where: { userId, code: { in: codes } },
      select: { code: true, value: true },
    });
    return new Map(rows.map((r) => [r.code, r.value]));
  }

  /**
   * 값을 돌며 개인정보 자리마다 fn을 부른다(fn이 돌려준 값으로 바꾼 사본을 돌려준다).
   * key: 지금 값의 칸 이름, person: 사람을 나타내는 객체 안인지
   */
  private walk(
    v: unknown,
    key: string,
    person: boolean,
    fn: (kind: PiiKind, value: string) => string | void,
  ): unknown {
    if (typeof v === 'string') return this.walkString(v, key, person, fn);
    if (Array.isArray(v)) return v.map((x) => this.walk(x, key, person, fn));
    if (v && typeof v === 'object') {
      // Date·Prisma Decimal 등은 JSON으로 나갈 모양으로 먼저
      const toJSON = (v as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === 'function') return this.walk(toJSON.call(v), key, person, fn);
      const obj = v as Record<string, unknown>;
      // 전화 칸이 있거나 사람을 뜻하는 칸 아래 객체면 그 안의 name은 사람 이름
      const isPerson =
        !NOT_PERSON.test(key) &&
        (PERSON_PARENT.test(key) ||
          Object.keys(obj).some((k) => PHONE_KEY.test(k) && typeof obj[k] === 'string'));
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(obj)) out[k] = this.walk(x, k, isPerson, fn);
      return out;
    }
    return v;
  }

  private walkString(
    s: string,
    key: string,
    person: boolean,
    fn: (kind: PiiKind, value: string) => string | void,
  ): string {
    if (!s.trim()) return s;
    const call = (kind: PiiKind, value: string) => fn(kind, value) ?? value;
    // 칸 전체를 가명으로 바꾸는 것은 아직 가명이 아닐 때만(이미 바꾼 값을 다시 바꾸지 않게)
    if (!s.includes('[[')) {
      if (PHONE_KEY.test(key) && digits(s).length >= 9) return call('PHONE', s);
      if (EMAIL_KEY.test(key) && s.includes('@')) return call('EMAIL', s);
      if (ADDR_KEY.test(key) && /[\p{L}\p{N}]/u.test(s)) {
        // 시·구만 있는 값(상세 없음)은 그대로 둔다
        if (regionOf(s) === s.trim()) return s;
        return call('ADDR', s);
      }
      if ((NAME_KEY.test(key) || (key === 'name' && person)) && s.trim().length <= 40) {
        return call('NAME', s);
      }
    }
    // 그 밖의 글자 — 전화번호·이메일만 찾아 바꾼다(가명 코드는 이 모양에 걸리지 않는다)
    return s
      .replace(PHONE_IN_TEXT, (m) => call('PHONE', m))
      .replace(EMAIL_IN_TEXT, (m) => call('EMAIL', m));
  }

  /** 모든 글자에 fn(값 바꾼 사본) */
  private strings(v: unknown, fn: (s: string) => string): unknown {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map((x) => this.strings(x, fn));
    if (v && typeof v === 'object') {
      const toJSON = (v as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === 'function') return this.strings(toJSON.call(v), fn);
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, this.strings(x, fn)]),
      );
    }
    return v;
  }
}

/** 가명 규칙 — AI 시스템 프롬프트에 넣는다 */
export const PSEUDONYM_GUIDE = `개인정보 가명: 고객·직원의 이름·전화번호·주소·이메일은 [[이름:K7Q2M9]], [[전화:K7Q2M9]], [[주소:서울 강남구 K7Q2M9]], [[이메일:K7Q2M9]] 같은 가명으로 바뀌어 있다(주소는 시·구까지만 보인다).
- 가명은 실제 값 대신이다. 답변·표·파일·도구 입력에 쓸 때는 대괄호까지 한 글자도 바꾸지 말고 그대로 옮겨 써라. 화면과 파일에서는 실제 값으로 바뀌어 보이고, 도구에 넣으면 서버가 실제 값으로 바꿔 실행한다.
- 같은 가명은 같은 사람·같은 값이다. 가명을 풀거나 추측하려 하지 말고, 가명이 아니라고 말하지 마라.`;
