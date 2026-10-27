import ExcelJS from 'exceljs';

/**
 * 참고 양식(엑셀·CSV) — 구조 읽기와 채우기.
 * 에이전트가 "이 양식 그대로" 파일을 만들 수 있게, 올린 양식의 칸 위치·글자·병합을 읽어 AI에게 보여 주고,
 * AI가 정한 값(칸 주소 → 값, 표 시작 칸 → 행들)을 원래 양식(서식·수식 유지)에 써 넣는다.
 */

export type TemplateKind = 'xlsx' | 'csv';

export interface SheetStructure {
  name: string;
  rowCount: number;
  colCount: number;
  merges: string[];
  /** 글자가 있는 칸(주소·값) — 앞쪽 일부만 */
  cells: { a: string; v: string }[];
  /** 수식 칸 — 값을 쓰지 않고 그대로 둔다 */
  formulas: { a: string; f: string }[];
  truncated: boolean;
}

export type TemplateStructure =
  | { kind: 'xlsx'; sheets: SheetStructure[] }
  | { kind: 'csv'; columns: string[]; sample: string[][] };

const MAX_SHEETS = 5;
const MAX_ROWS = 80;
const MAX_COLS = 30;
const MAX_CELLS = 400;

export const TEMPLATE_TYPES: Record<string, TemplateKind> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
};

export function kindOf(name: string, mediaType: string): TemplateKind | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'csv') return 'csv';
  return TEMPLATE_TYPES[mediaType.split(';')[0].trim()] ?? null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return v.result === undefined ? '' : String(v.result);
    return '';
  }
  return String(v);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** 양식 구조 읽기 */
export async function analyzeTemplate(
  kind: TemplateKind,
  bytes: Buffer,
): Promise<TemplateStructure> {
  if (kind === 'csv') {
    const rows = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (!rows.length) throw new Error('CSV에 내용이 없습니다.');
    return { kind, columns: rows[0], sample: rows.slice(1, 6) };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheets: SheetStructure[] = [];
  wb.eachSheet((ws) => {
    if (sheets.length >= MAX_SHEETS) return;
    const cells: SheetStructure['cells'] = [];
    const formulas: SheetStructure['formulas'] = [];
    let truncated = ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLS;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r > MAX_ROWS) return;
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > MAX_COLS) return;
        if (cell.isMerged && cell.master.address !== cell.address) return;
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v) {
          formulas.push({ a: cell.address, f: String(v.formula) });
          return;
        }
        const t = cellText(v).trim();
        if (!t) return;
        if (cells.length >= MAX_CELLS) {
          truncated = true;
          return;
        }
        cells.push({ a: cell.address, v: t.slice(0, 80) });
      });
    });
    const merges = ((ws as unknown as { model: { merges?: string[] } }).model.merges ?? []).slice(
      0,
      80,
    );
    sheets.push({
      name: ws.name,
      rowCount: ws.rowCount,
      colCount: ws.columnCount,
      merges,
      cells,
      formulas: formulas.slice(0, 80),
      truncated,
    });
  });
  if (!sheets.length) throw new Error('엑셀에 시트가 없습니다.');
  return { kind: 'xlsx', sheets };
}

/** AI에게 보여 줄 양식 설명(글자) */
export function describeTemplate(name: string, st: TemplateStructure): string {
  if (st.kind === 'csv') {
    return `CSV 양식 "${name}" — 열: ${st.columns.join(', ')}${
      st.sample.length ? `\n예시 행: ${st.sample.map((r) => r.join(' | ')).join(' / ')}` : ''
    }`;
  }
  return st.sheets
    .map(
      (s) =>
        `엑셀 양식 "${name}" 시트 "${s.name}" (${s.rowCount}행 × ${s.colCount}열${
          s.truncated ? ', 앞부분만' : ''
        })\n` +
        `글자 칸: ${s.cells.map((c) => `${c.a}="${c.v}"`).join(', ')}` +
        (s.formulas.length
          ? `\n수식 칸(자동 계산, 쓰지 않음): ${s.formulas.map((f) => `${f.a}=${f.f}`).join(', ')}`
          : '') +
        (s.merges.length ? `\n병합: ${s.merges.join(', ')}` : ''),
    )
    .join('\n\n');
}

/** AI가 정해 주는 채울 내용 */
export interface FillSpec {
  fileName: string;
  sheets: {
    name: string;
    cells: { addr: string; value: string }[];
    tables: { startCell: string; rows: string[][] }[];
  }[];
}

export const FILL_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fileName', 'sheets'],
  properties: {
    fileName: { type: 'string', description: '확장자 없는 파일 이름(예: "주간보고_2026-10-27")' },
    sheets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'cells', 'tables'],
        properties: {
          name: { type: 'string' },
          cells: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['addr', 'value'],
              properties: { addr: { type: 'string' }, value: { type: 'string' } },
            },
          },
          tables: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['startCell', 'rows'],
              properties: {
                startCell: {
                  type: 'string',
                  description: '첫 데이터 행의 첫 칸(머리글 바로 아래)',
                },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** 숫자로 보이는 글자는 숫자로(0으로 시작하는 전화번호·코드는 글자 그대로) */
function conv(v: string): string | number | null {
  const s = v.trim();
  if (s === '') return null;
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s.replace(/,/g, '')) && !/^0\d/.test(s)) {
    return Number(s.replace(/,/g, ''));
  }
  return v;
}

const isFormula = (v: ExcelJS.CellValue) => !!v && typeof v === 'object' && 'formula' in v;

/** 표 시작 행부터 시작해 옛 끝 행(oldEnd)까지 가는 범위를 행을 늘린 만큼 넓힌다 */
function widenFormulas(ws: ExcelJS.Worksheet, start: number, oldEnd: number, added: number) {
  const re = /(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/g;
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      const v = cell.value;
      if (!v || typeof v !== 'object' || !('formula' in v) || !v.formula) return;
      const f = String(v.formula).replace(
        re,
        (m, c1: string, r1: string, c2: string, r2: string) =>
          Number(r1) === start && Number(r2) >= start && Number(r2) <= oldEnd
            ? `${c1}${r1}:${c2}${Number(r2) + added}`
            : m,
      );
      if (f !== v.formula) cell.value = { formula: f };
    }),
  );
}

/** 양식에 값을 써 넣은 파일 */
export async function fillTemplate(
  kind: TemplateKind,
  bytes: Buffer,
  spec: FillSpec,
): Promise<Buffer> {
  if (kind === 'csv') {
    const head = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''))[0] ?? [];
    const rows = spec.sheets.flatMap((s) => s.tables.flatMap((t) => t.rows));
    const esc = (x: string) => (/[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const text = [head, ...rows]
      .map((r) => r.map((x) => esc(String(x ?? ''))).join(','))
      .join('\r\n');
    return Buffer.from(`\uFEFF${text}\r\n`, 'utf8');
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const first = wb.worksheets[0];
  for (const s of spec.sheets) {
    const ws = wb.getWorksheet(s.name) ?? first;
    if (!ws) continue;
    // 1) 표 — 아래쪽 표부터(행을 끼워 넣어도 위쪽 표 위치가 바뀌지 않게)
    const tables = [...s.tables]
      .map((t) => {
        try {
          const cell = ws.getCell(t.startCell);
          return { ...t, row: Number(cell.row), col: Number(cell.col) };
        } catch {
          return null;
        }
      })
      .filter((t): t is NonNullable<typeof t> => !!t)
      .sort((a, b) => b.row - a.row);
    const shifts: { row: number; added: number }[] = [];
    for (const t of tables) {
      const width = Math.max(1, ...t.rows.map((r) => r.length));
      const rowEmpty = (r: number) => {
        for (let c = t.col; c < t.col + width; c++) {
          const v = ws.getCell(r, c).value;
          if (v !== null && v !== undefined && v !== '') return false;
        }
        return true;
      };
      let inserted = 0;
      t.rows.forEach((vals, i) => {
        const r = t.row + i;
        // 양식에 미리 그려 둔 빈 행은 그대로 쓰고, 빈 행이 모자라면(합계 행 등을 만나면) 위 행 서식으로 끼워 넣는다
        if (i > 0 && !rowEmpty(r)) {
          ws.insertRow(r, [], 'i');
          inserted++;
        }
        vals.forEach((v, k) => {
          const cell = ws.getCell(r, t.col + k);
          if (!isFormula(cell.value)) cell.value = conv(v);
        });
      });
      // 행을 늘렸으면 표를 가리키던 수식(합계 등)의 범위도 늘린다 — 예: SUM(B5:B7) → SUM(B5:B9)
      if (inserted) {
        widenFormulas(ws, t.row, t.row + t.rows.length - 1 - inserted, inserted);
        shifts.push({ row: t.row, added: inserted });
      }
    }
    // 2) 낱칸 — 주소는 양식 원래 위치. 표가 늘어난 만큼 아래 칸을 옮겨 쓴다. 수식 칸은 건드리지 않는다
    for (const c of s.cells) {
      try {
        const orig = ws.getCell(c.addr);
        const row = Number(orig.row);
        const moved = row + shifts.filter((x) => x.row < row).reduce((n, x) => n + x.added, 0);
        const cell = ws.getCell(moved, Number(orig.col));
        const target = cell.isMerged ? cell.master : cell;
        if (!isFormula(target.value)) target.value = conv(c.value);
      } catch {
        // 잘못된 주소는 건너뛴다
      }
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
