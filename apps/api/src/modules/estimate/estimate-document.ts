import {
  ACCESS_LABEL,
  summarizeVolume,
  type AccessMethod,
  type EstimateMeta,
  type HandlingBucket,
} from '@tongin/shared';

/**
 * 계약서·견적서 문서(HTML) — 종이 양식(A4 2쪽) 그대로.
 *  1쪽 계약서·견적서: 머리 정보·주소·일정·생활서비스·작업 지시·금액·분해설치 수량·서명
 *  2쪽 이사물량 견적표: 방마다 품목(방 틀 순서) × 메모·CBM·처리, 목록 밖 물품은 '기타N' 칸에 품목명을 메모로
 * 브라우저 인쇄(PDF 저장)로 내보내는 것을 전제로 한다.
 */

/** 회사 고정 정보(문서 바닥글) */
const COMPANY = {
  web: 'www.tonginexp.com',
  callCenter: '1899-0123',
  headOffice: '02-3678-0123',
  address: '서울시 서초구 양재동 263-2, 통인빌딩',
};

type Num = { toString(): string } | number | string | null | undefined;

export interface DocLine {
  zoneId: string | null;
  cbmItemId: string | null;
  itemName: string;
  cbm: Num;
  ton: Num;
  qty: Num;
  handling: string;
  memo: string | null;
}
export interface DocAddon {
  addonServiceId: string | null;
  name: string;
  variant: string | null;
  serviceDate: Date | null;
  qty: Num;
  amount: Num;
  memo: string | null;
}
export interface DocCatalogOption {
  id: string;
  name: string;
  groupCode: string;
  kind: string;
  variants: { value: string; label: string }[] | null;
}
export interface DocRoom {
  code: string;
  name: string;
  extraSlots: number;
  items: { id: string; name: string }[];
}
export interface EstimateDocInput {
  estimateNo: string;
  contractNo: string | null;
  signedAt: Date | null;
  meta: EstimateMeta;
  fromAddr: string | null;
  fromAddrDetail: string | null;
  toAddr: string | null;
  toAddrDetail: string | null;
  fromPyeong: number | null;
  toPyeong: number | null;
  fromAccess: string;
  fromAccessNote: string | null;
  toAccess: string;
  toAccessNote: string | null;
  volumeUnit: string;
  moveAmount: Num;
  /** 예전 견적의 이사비용(금액 확정 전 기본가) */
  baseAmount: Num;
  vatMode: string;
  vatAmount: Num;
  totalAmount: Num;
  depositAmount: Num;
  balanceAmount: Num;
  workInstructions: string | null;
  zones: { id: string; name: string; roomKey: string | null }[];
  lines: DocLine[];
  addons: DocAddon[];
  catalog: DocCatalogOption[];
  rooms: DocRoom[];
  handlings: { code: string; name: string; bucket: string }[];
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
const n = (v: Num) => (v == null || v === '' ? 0 : Number(v));
const money = (v: Num) => `${n(v).toLocaleString('ko-KR')} <small>₩</small>`;
/** 소수 한 자리까지(부동소수 오차 정리), 0이면 빈칸 */
const vol = (v: number) => (v ? String(Math.round(v * 100) / 100) : '');
const dash = (v: unknown) => (v == null || v === '' ? '--' : esc(v));

interface SheetRow {
  label: string;
  memo: string;
  value: number;
  handling: string;
}
interface SheetRoom {
  name: string;
  rows: SheetRow[];
}

/** 방 하나의 견적표 줄 — 방 틀 품목을 순서대로 깔고, 목록 밖 물품은 기타N 칸에 메모(품목명)로 */
function buildRoom(
  name: string,
  room: DocRoom | null,
  lines: DocLine[],
  value: (l: DocLine) => number,
  handlingName: (code: string) => string,
): SheetRoom {
  const rows: SheetRow[] = [];
  const rest: DocLine[] = [];
  if (room) {
    const byItem = new Map<string, SheetRow>();
    const byName = new Map<string, SheetRow>();
    for (const it of room.items) {
      const row = { label: it.name, memo: '', value: 0, handling: '' };
      rows.push(row);
      byItem.set(it.id, row);
      byName.set(it.name, row);
    }
    for (const l of lines) {
      const row = (l.cbmItemId && byItem.get(l.cbmItemId)) || byName.get(l.itemName);
      if (!row) {
        rest.push(l);
        continue;
      }
      // 같은 품목이 여러 줄이면 합치고 메모는 이어 쓴다
      row.value += value(l);
      if (l.memo) row.memo = row.memo ? `${row.memo}, ${l.memo}` : l.memo;
      if (!row.handling) row.handling = handlingName(l.handling);
    }
    const slots = Math.max(room.extraSlots, rest.length);
    for (let i = 0; i < slots; i++) {
      const l = rest[i];
      rows.push({
        label: `기타${i + 1}`,
        memo: l ? [l.itemName, l.memo].filter(Boolean).join(' · ') : '',
        value: l ? value(l) : 0,
        handling: l ? handlingName(l.handling) : '',
      });
    }
  } else {
    for (const l of lines) {
      rows.push({
        label: l.itemName,
        memo: l.memo ?? '',
        value: value(l),
        handling: handlingName(l.handling),
      });
    }
  }
  return { name, rows };
}

/** 품목 칸이 같은 방(안방·건너방…)은 한 표에 옆으로 붙인다 */
function sheetTable(group: SheetRoom[], unitText: string): string {
  const labels = group[0].rows.map((r) => r.label);
  const head = `<tr><th class="corner" rowspan="2"><span class="c-room">방 <small>ROOM</small></span><span class="c-item">품목 <small>ARTICLE</small></span></th>${group
    .map((g) => `<th colspan="3" class="room">${esc(g.name)}</th>`)
    .join('')}</tr><tr>${group
    .map(() => `<th class="sub">메모</th><th class="sub">${unitText}</th><th class="sub">처리</th>`)
    .join('')}</tr>`;
  const body = labels
    .map(
      (label, i) =>
        `<tr><th class="item">${esc(label)}</th>${group
          .map((g) => {
            const r = g.rows[i];
            return `<td class="memo">${esc(r.memo)}</td><td class="num">${vol(r.value)}</td><td class="hd">${r.value || r.memo ? esc(r.handling) : ''}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  const foot = `<tr class="subtotal"><th class="item">소계</th>${group
    .map(
      (g) =>
        `<td></td><td class="num">${vol(g.rows.reduce((s, r) => s + r.value, 0))}</td><td></td>`,
    )
    .join('')}</tr>`;
  return `<table class="sheet">${head}${body}${foot}</table>`;
}

export function renderEstimateDocument(d: EstimateDocInput): string {
  const m = d.meta;
  const unit = d.volumeUnit === 'TON' ? 'TON' : 'CBM';
  const unitText = unit === 'TON' ? 'TON' : 'CBM';
  const handlingMap = new Map(d.handlings.map((h) => [h.code, h]));
  const handlingName = (code: string) => handlingMap.get(code)?.name ?? code;
  const value = (l: DocLine) => (unit === 'TON' ? n(l.ton) : n(l.cbm));
  const v = summarizeVolume(d.lines, {
    unit,
    buckets: Object.fromEntries(d.handlings.map((h) => [h.code, h.bucket as HandlingBucket])),
  });

  // ── 금액 — 옵션은 카탈로그 묶음(사다리차·분해설치·생활서비스·기타)별로 ──
  const catalog = new Map(d.catalog.map((c) => [c.id, c]));
  const groupOf = (a: DocAddon) =>
    (a.addonServiceId && catalog.get(a.addonServiceId)?.groupCode) || 'LIVING_ETC';
  const sumOf = (pred: (a: DocAddon) => boolean) =>
    d.addons.filter(pred).reduce((s, a) => s + n(a.amount), 0);
  const living = d.catalog.filter((c) => c.groupCode === 'LIVING');
  const livingNamed = living.filter((c) => c.name !== '기타서비스');
  const etcServiceIds = new Set(living.filter((c) => c.name === '기타서비스').map((c) => c.id));
  const storageIds = new Set(
    d.catalog.filter((c) => c.groupCode === 'ETC' && c.kind !== 'VOLUME').map((c) => c.id),
  );
  const priceRows: [string, number][] = [
    ['사다리차 비용', sumOf((a) => groupOf(a) === 'LADDER')],
    ['옵션 비용', sumOf((a) => groupOf(a) === 'ASSEMBLY')],
    ...livingNamed.map(
      (c) => [c.name, sumOf((a) => a.addonServiceId === c.id)] as [string, number],
    ),
    [
      '기타서비스',
      sumOf(
        (a) =>
          !a.addonServiceId ||
          etcServiceIds.has(a.addonServiceId) ||
          !catalog.has(a.addonServiceId),
      ),
    ],
    ['보관비용', sumOf((a) => !!a.addonServiceId && storageIds.has(a.addonServiceId))],
  ];
  const optionTotal = d.addons.reduce((s, a) => s + n(a.amount), 0);
  const moveAmount = d.moveAmount ?? d.baseAmount;
  const vatIncluded = d.vatMode === 'INCLUDED';
  const total = d.totalAmount != null ? n(d.totalAmount) : n(moveAmount) + optionTotal;

  // ── 생활 서비스 신청 현황(종류·요청일) — 3개씩 한 줄 ──
  const svcCells = livingNamed.map((c) => {
    const picked = d.addons.filter((a) => a.addonServiceId === c.id);
    const kind = picked.length
      ? picked
          .map((a) =>
            a.variant
              ? (c.variants?.find((x) => x.value === a.variant)?.label ?? a.variant)
              : '신청',
          )
          .join(', ')
      : '-';
    const date = picked.find((a) => a.serviceDate)?.serviceDate;
    return `<th>${esc(c.name)}</th><td>${esc(kind)}</td><td>${date ? date.toISOString().slice(0, 10) : '-'}</td>`;
  });
  const svcRows: string[] = [];
  for (let i = 0; i < svcCells.length; i += 3) {
    const row = svcCells.slice(i, i + 3);
    while (row.length < 3) row.push('<th></th><td></td><td></td>');
    svcRows.push(`<tr>${row.join('')}</tr>`);
  }

  // ── 분해·설치 수량 — 카탈로그 순서대로 세로 4줄씩, 마지막 칸은 옵션 합계 ──
  const assembly = d.catalog.filter((c) => c.groupCode === 'ASSEMBLY');
  const qtyOf = (id: string) =>
    d.addons.filter((a) => a.addonServiceId === id).reduce((s, a) => s + n(a.qty), 0);
  const asmCells: [string, number][] = assembly.map((c) => [c.name, qtyOf(c.id)]);
  asmCells.push(['옵션 합계', asmCells.reduce((s, [, q]) => s + q, 0)]);
  const asmRowsN = Math.max(1, Math.ceil(asmCells.length / 3));
  const asmRows = Array.from({ length: asmRowsN }, (_, r) =>
    [0, 1, 2]
      .map((c) => asmCells[c * asmRowsN + r])
      .map((cell) => (cell ? `<th>${esc(cell[0])}</th><td>${cell[1]}</td>` : '<th></th><td></td>'))
      .join(''),
  );

  // ── 2쪽: 방별 견적표 ──
  const roomByCode = new Map(d.rooms.map((r) => [r.code, r]));
  const sheet: SheetRoom[] = [];
  const usedZones = new Set<string>();
  for (const r of d.rooms) {
    const zones = d.zones.filter((z) => z.roomKey === r.code);
    zones.forEach((z) => usedZones.add(z.id));
    const zoneIds = new Set(zones.map((z) => z.id));
    sheet.push(
      buildRoom(
        r.name,
        r,
        d.lines.filter((l) => l.zoneId && zoneIds.has(l.zoneId)),
        value,
        handlingName,
      ),
    );
  }
  for (const z of d.zones) {
    if (usedZones.has(z.id)) continue;
    const lines = d.lines.filter((l) => l.zoneId === z.id);
    if (!lines.length) continue;
    const tpl = z.roomKey ? (roomByCode.get(z.roomKey) ?? null) : null;
    sheet.push(buildRoom(z.name, tpl, lines, value, handlingName));
  }
  const loose = d.lines.filter((l) => !l.zoneId || !d.zones.some((z) => z.id === l.zoneId));
  if (loose.length) sheet.push(buildRoom('방 미지정', null, loose, value, handlingName));

  // 품목 칸이 같은 방끼리 묶는다(최대 5개씩 한 표)
  const groups: SheetRoom[][] = [];
  const sig = (r: SheetRoom) => r.rows.map((x) => x.label).join('|');
  for (const r of sheet) {
    const last = groups[groups.length - 1];
    if (last && last.length < 5 && sig(last[0]) === sig(r) && r.rows.length > 8) last.push(r);
    else groups.push([r]);
  }
  const wide = groups.filter((g) => g.length > 1);
  const narrow = groups.filter((g) => g.length === 1);

  const access = (a: string, note: string | null) =>
    a === 'NONE'
      ? '-'
      : `${esc(ACCESS_LABEL[a as AccessMethod] ?? a)}${a === 'ETC' && note ? `(${esc(note)})` : ''}`;
  const addr = (a: string | null, dt: string | null) =>
    a ? `${esc(a)}${dt ? `, ${esc(dt)}` : ''}` : '--';
  const serial = d.contractNo ?? d.estimateNo;
  const manager = m.estimatorName
    ? `${esc(m.estimatorName)}${m.orgUnitName ? `(${esc(m.orgUnitName)})` : ''}`
    : '--';
  const signed = !!d.signedAt;

  const header = (title: string) =>
    `<header class="head"><div class="logo"><span class="tag">마음까지 통하는 사람들 ~</span><span class="brand">통인익스프레스</span></div><h1>${title}</h1></header>`;
  const footer = (page: number) =>
    `<footer class="foot"><b>${COMPANY.web}</b><span>고객센터: ${COMPANY.callCenter}</span><span>본사: ${COMPANY.headOffice}</span><span>${COMPANY.address}</span><div class="serial">SERIAL NO.<br>${esc(serial)}</div></footer><div class="pageno">- ${page} -</div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>계약서·견적서 ${esc(serial)}</title><style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e5e7eb;font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:8px;padding:10px;background:#111827}
.toolbar button{font:inherit;font-size:13px;font-weight:700;padding:8px 18px;border-radius:8px;border:0;cursor:pointer;background:#ef7b2b;color:#fff}
.page{position:relative;width:210mm;min-height:297mm;margin:16px auto;padding:10mm 9mm 20mm;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.12)}
.head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:5mm}
.logo{display:flex;flex-direction:column;line-height:1.1}
.logo .tag{font-size:8px;color:#ef7b2b}
.logo .brand{font-size:21px;font-weight:900;color:#ef7b2b;letter-spacing:-.5px}
h1{margin:0;font-size:28px;font-weight:900;letter-spacing:-1px}
table{width:100%;border-collapse:collapse}
.info{border-top:2px solid #111;border-bottom:2px solid #111;margin-bottom:4mm}
.info th,.info td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px}
.info th{background:#f3f4f6;font-weight:600;white-space:nowrap}
.info td{font-weight:600}
.svc{border-top:2px solid #111;border-bottom:1px solid #111;margin-bottom:4mm}
.svc th,.svc td{padding:5px 6px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:11px}
.svc th{background:#f3f4f6;font-weight:600;white-space:nowrap}
.mid{display:grid;grid-template-columns:1fr 92mm;gap:5mm}
.note{border:1px solid #9ca3af;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.55;white-space:pre-wrap}
.price{border-top:2px solid #111}
.price th,.price td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:12px}
.price th{background:#f3f4f6;text-align:left;font-weight:600;width:40%}
.price td{text-align:right;font-weight:700}
.price td small{color:#6b7280;font-weight:400}
.price tr.big th,.price tr.big td{font-size:15px;font-weight:800;padding:7px 8px}
.price tr.first th,.price tr.first td{border-top:2px solid #111}
.bottom{display:grid;grid-template-columns:1fr 92mm;gap:5mm;margin-top:4mm}
.asm{border-top:2px solid #111;border-bottom:1px solid #111}
.asm th,.asm td{padding:5px 6px;border:1px solid #e5e7eb;text-align:center;font-size:11px}
.asm th{background:#f3f4f6;font-weight:500}
.sign .agree{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:2px solid #111;font-size:13px}
.box{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:3px;border:1.5px solid #ef7b2b;color:#fff;font-size:11px}
.box.on{background:#ef7b2b}
.sign .line{display:flex;gap:12px;min-height:22mm;padding:8px 0;border-bottom:2px solid #111;font-size:13px}
.sign .line .who{flex:1;text-align:right;align-self:flex-end;color:#374151}
.foot{position:absolute;left:9mm;right:9mm;bottom:9mm;display:flex;align-items:center;gap:18px;font-size:9px;color:#4b5563}
.foot b{color:#111}
.foot .serial{margin-left:auto;border:1px solid #9ca3af;padding:4px 14px;text-align:center;color:#111}
.pageno{position:absolute;bottom:4mm;left:0;right:0;text-align:center;font-size:9px;color:#6b7280}
.sheet{margin-bottom:4mm;border:1.5px solid #111}
.sheet th,.sheet td{border:1px solid #d1d5db;padding:3px 5px;font-size:10px;height:16px;padding-top:2px;padding-bottom:2px}
.sheet th.room{font-size:11px;border-bottom:1px solid #111}
.sheet th.sub{font-weight:600;background:#fff}
.sheet th.item{text-align:left;font-weight:600;white-space:nowrap;border-right:1.5px solid #111;width:64px}
.sheet tr:nth-child(odd) td,.sheet tr:nth-child(odd) th.item{background:#f9fafb}
.sheet td.num,.sheet td.hd{text-align:center}
.sheet td.num{font-weight:700}
.sheet td.memo{font-size:8px;color:#374151;text-align:center}
.sheet tr.subtotal th,.sheet tr.subtotal td{border-top:1.5px solid #111;background:#fff}
.corner{position:relative;width:64px;border-right:1.5px solid #111;background:linear-gradient(to top right,transparent calc(50% - .5px),#111 50%,transparent calc(50% + .5px))}
.corner .c-room{position:absolute;top:3px;right:5px}
.corner .c-item{position:absolute;bottom:3px;left:5px}
.corner small{font-size:6px;color:#6b7280;font-weight:400}
.flow{columns:3;column-gap:5mm}
.flow .sheet{break-inside:avoid;display:table}
@media print{body{background:#fff}.toolbar{display:none}.page{margin:0;box-shadow:none;page-break-after:always}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">인쇄 · PDF 저장</button></div>

<section class="page">
${header('계약서 • 견적서')}
<table class="info">
<tr><th>고객명</th><td>${dash(m.customerName)}</td><th>이사종류</th><td>${dash(m.productName)}</td><th>전화번호</th><td>${dash(m.customerPhone)}</td></tr>
<tr><th>담당자</th><td>${manager}</td><th>지점명</th><td>${dash(m.orgUnitName)}</td><th>담당자 연락처</th><td>${dash(m.estimatorPhone)}</td></tr>
</table>
<table class="info">
<tr><th>이사 전 주소</th><td style="width:46%">${addr(d.fromAddr, d.fromAddrDetail)}</td><th>작업조건 (전)</th><td>${d.fromPyeong ?? 0}(평)</td><td>${access(d.fromAccess, d.fromAccessNote)}</td></tr>
<tr><th>이사 후 주소</th><td>${addr(d.toAddr, d.toAddrDetail)}</td><th>작업조건 (후)</th><td>${d.toPyeong ?? 0}(평)</td><td>${access(d.toAccess, d.toAccessNote)}</td></tr>
</table>
<table class="info">
<tr><th>접수일</th><td>${dash(m.receivedDate)}</td><th>상담일</th><td>${dash(m.consultDate)}</td><th>계약일</th><td>${dash(m.contractDate)}</td><th>이사일</th><td>${dash(m.workDate)}</td></tr>
</table>
${svcRows.length ? `<table class="svc">${svcRows.join('')}</table>` : ''}
<div class="mid">
<div class="note">${esc(d.workInstructions ?? '')}</div>
<table class="price">
<tr><th>물량(운반/경유/폐기)</th><td>${vol(v.moving) || 0} / ${vol(v.transit) || 0} / ${vol(v.discard) || 0} <small>${unit === 'TON' ? '톤' : 'cbm'}</small></td></tr>
<tr><th>이사비용</th><td>${money(moveAmount)}</td></tr>
${priceRows.map(([k, a]) => `<tr><th>${esc(k)}</th><td>${money(a)}</td></tr>`).join('')}
<tr><th>부가세(VAT)</th><td>${vatIncluded ? money(d.vatAmount) : '부가세 별도'}</td></tr>
<tr class="big first"><th>총 비용</th><td>${money(total)}</td></tr>
<tr class="big"><th>계약금</th><td>${money(d.depositAmount)}</td></tr>
<tr class="big"><th>잔금</th><td>${money(d.balanceAmount)}</td></tr>
</table>
</div>
<div class="bottom">
<table class="asm">${asmRows.map((r) => `<tr>${r}</tr>`).join('')}</table>
<div class="sign">
<div class="agree">이용약관 및 개인정보 수집/활용 동의 <span class="box${signed ? ' on' : ''}">${signed ? '✓' : ''}</span></div>
<div class="line">고객서명<span class="who">${signed ? `${esc(m.customerName ?? '')} (전자서명 ${d.signedAt!.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })})` : ''}</span></div>
</div>
</div>
${footer(1)}
</section>

<section class="page">
${header('이사물량 견적표')}
${wide.map((g) => sheetTable(g, unitText)).join('')}
<div class="flow">${narrow.map((g) => sheetTable(g, unitText)).join('')}</div>
${footer(2)}
</section>
</body></html>`;
}
