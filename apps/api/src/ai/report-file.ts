import { existsSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * AI 보고서 파일 만들기 — 표(열 이름 + 행) 하나를 엑셀·CSV·PDF로.
 * 코드 실행 샌드박스 없이 서버에서 바로 만든다(빠르고 싸고, 한글 PDF 글꼴이 확실하다).
 */

export type ReportFormat = 'xlsx' | 'csv' | 'pdf';
export type Cell = string | number | boolean | null;

export interface ReportInput {
  format: ReportFormat;
  title: string;
  columns: string[];
  rows: Cell[][];
  sheetName?: string;
  /** 표 위에 붙는 한두 줄 설명(조회 기준 등) */
  note?: string;
}

export interface ReportFile {
  name: string;
  mediaType: string;
  bytes: Buffer;
}

export const REPORT_LIMITS = { columns: 40, rows: 5000, cellChars: 1000 };

export const MEDIA_TYPES: Record<ReportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

/** 빌드 결과(dist/ai)와 소스(src/ai) 어디서 돌아도 apps/api/assets/fonts를 찾는다 */
const FONT_DIR = [join(__dirname, '../../assets/fonts'), join(process.cwd(), 'assets/fonts')].find(
  (d) => existsSync(join(d, 'Pretendard-Regular.otf')),
);

/** 파일 이름에 못 쓰는 글자(경로·예약 문자·제어 문자) */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_RE = /[\\/:*?"<>|\u0000-\u001f]/g;
/** 한글·한자·전각 — 표시 폭 2칸 */
const WIDE_RE = /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

/** 파일 이름으로 쓸 수 없는 글자를 빼고 길이를 자른다(한글은 그대로) */
export function safeFileName(title: string, ext: string) {
  const base =
    title.replace(UNSAFE_NAME_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '보고서';
  return `${base}.${ext}`;
}

/** 입력 검증 + 정리(열 수에 맞춰 행 길이 맞추기, 너무 긴 글 자르기) */
export function normalizeReport(input: Record<string, unknown>): ReportInput {
  const format = input.format;
  if (format !== 'xlsx' && format !== 'csv' && format !== 'pdf') {
    throw new Error('format은 xlsx·csv·pdf 중 하나여야 합니다.');
  }
  const title = String(input.title ?? '').trim() || '보고서';
  const columns = Array.isArray(input.columns) ? input.columns.map((c) => String(c ?? '')) : [];
  if (!columns.length) throw new Error('columns(열 이름)가 비어 있습니다.');
  if (columns.length > REPORT_LIMITS.columns) {
    throw new Error(`열은 ${REPORT_LIMITS.columns}개까지입니다.`);
  }
  const rawRows = Array.isArray(input.rows) ? input.rows : [];
  if (rawRows.length > REPORT_LIMITS.rows) {
    throw new Error(`행은 ${REPORT_LIMITS.rows}개까지입니다. 조건을 좁히거나 나눠서 만드세요.`);
  }
  const cell = (v: unknown): Cell => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.slice(0, REPORT_LIMITS.cellChars);
  };
  const rows = rawRows.map((r) => {
    const arr = Array.isArray(r) ? r : [r];
    return columns.map((_, i) => cell(arr[i]));
  });
  const sheetName = typeof input.sheetName === 'string' ? input.sheetName : undefined;
  const note = typeof input.note === 'string' ? input.note.slice(0, 500) : undefined;
  return { format, title, columns, rows, sheetName, note };
}

export async function buildReport(r: ReportInput): Promise<ReportFile> {
  const bytes =
    r.format === 'xlsx' ? await buildXlsx(r) : r.format === 'csv' ? buildCsv(r) : await buildPdf(r);
  return { name: safeFileName(r.title, r.format), mediaType: MEDIA_TYPES[r.format], bytes };
}

/** 표시 폭 — 한글·전각은 2칸으로 센다(열 너비 계산용) */
function displayWidth(v: Cell) {
  const s = v === null ? '' : typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v);
  let w = 0;
  for (const ch of s) w += WIDE_RE.test(ch) ? 2 : 1;
  return w;
}

const isNumberColumn = (rows: Cell[][], i: number) =>
  rows.length > 0 &&
  rows.some((r) => typeof r[i] === 'number') &&
  rows.every((r) => r[i] === null || typeof r[i] === 'number');

async function buildXlsx(r: ReportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '통인 ERP AI 비서';
  wb.created = new Date();
  // 시트 이름: 31자, []:*?/\ 금지
  const sheet = (r.sheetName || r.title).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';
  const ws = wb.addWorksheet(sheet);

  ws.getCell(1, 1).value = r.title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  let headerRow = 3;
  if (r.note) {
    ws.getCell(2, 1).value = r.note;
    ws.getCell(2, 1).font = { color: { argb: 'FF666666' } };
    headerRow = 4;
  }

  const header = ws.getRow(headerRow);
  r.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  r.rows.forEach((row, ri) => {
    const xr = ws.getRow(headerRow + 1 + ri);
    row.forEach((v, ci) => {
      xr.getCell(ci + 1).value = v;
    });
  });
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const w = Math.max(displayWidth(c), ...r.rows.slice(0, 500).map((row) => displayWidth(row[i])));
    col.width = Math.min(Math.max(w + 2, 8), 60);
    if (isNumberColumn(r.rows, i)) {
      const allInt = r.rows.every((row) => row[i] === null || Number.isInteger(row[i]));
      col.numFmt = allInt ? '#,##0' : '#,##0.##';
    }
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: r.columns.length },
  };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildCsv(r: ReportInput): Buffer {
  const esc = (v: Cell) => {
    const s = v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns, ...r.rows].map((row) => row.map(esc).join(','));
  // BOM — 엑셀에서 열어도 한글이 깨지지 않게
  return Buffer.from(`\ufeff${lines.join('\r\n')}\r\n`, 'utf8');
}

async function buildPdf(r: ReportInput): Promise<Buffer> {
  if (!FONT_DIR) throw new Error('PDF용 한글 글꼴(assets/fonts)을 찾지 못했습니다.');
  const landscape = r.columns.length > 6;
  const doc = new PDFDocument({
    size: 'A4',
    layout: landscape ? 'landscape' : 'portrait',
    margins: { top: 40, bottom: 40, left: 36, right: 36 },
    bufferPages: true,
    info: { Title: r.title, Creator: '통인 ERP AI 비서' },
  });
  doc.registerFont('R', join(FONT_DIR, 'Pretendard-Regular.otf'));
  doc.registerFont('B', join(FONT_DIR, 'Pretendard-Bold.otf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 14;

  doc.font('B').fontSize(16).fillColor('#111').text(r.title, left, doc.page.margins.top);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  doc
    .font('R')
    .fontSize(9)
    .fillColor('#666')
    .text(`작성: ${today} (통인 ERP AI 비서) · ${r.rows.length.toLocaleString('ko-KR')}행`);
  if (r.note) doc.text(r.note);
  doc.moveDown(0.6);

  // 열 너비 — 내용 길이 비례(최소·최대 제한) 후 전체 폭에 맞춘다
  const fontSize = r.columns.length > 10 ? 7 : 8.5;
  const want = r.columns.map((c, i) =>
    Math.min(
      Math.max(displayWidth(c), ...r.rows.slice(0, 300).map((row) => displayWidth(row[i])), 4),
      40,
    ),
  );
  const total = want.reduce((a, b) => a + b, 0);
  const widths = want.map((w) => (w / total) * width);
  const numeric = r.columns.map((_, i) => isNumberColumn(r.rows, i));
  const pad = 3;
  const text = (v: Cell) =>
    v === null ? '' : typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v);

  const rowHeight = (cells: string[], font: 'R' | 'B') => {
    doc.font(font).fontSize(fontSize);
    return (
      Math.max(
        ...cells.map((s, i) => doc.heightOfString(s || ' ', { width: widths[i] - pad * 2 })),
      ) +
      pad * 2
    );
  };
  const drawRow = (cells: string[], y: number, h: number, head: boolean, zebra: boolean) => {
    if (head) doc.rect(left, y, width, h).fill('#eef2f6');
    else if (zebra) doc.rect(left, y, width, h).fill('#fafbfc');
    let x = left;
    doc
      .font(head ? 'B' : 'R')
      .fontSize(fontSize)
      .fillColor('#111');
    cells.forEach((s, i) => {
      doc.text(s, x + pad, y + pad, {
        width: widths[i] - pad * 2,
        align: head ? 'center' : numeric[i] ? 'right' : 'left',
      });
      x += widths[i];
    });
    doc
      .moveTo(left, y + h)
      .lineTo(left + width, y + h)
      .lineWidth(0.4)
      .strokeColor(head ? '#999' : '#ddd')
      .stroke();
  };

  const headCells = r.columns;
  const headH = rowHeight(headCells, 'B');
  let y = doc.y;
  drawRow(headCells, y, headH, true, false);
  y += headH;
  r.rows.forEach((row, ri) => {
    const cells = row.map(text);
    const h = rowHeight(cells, 'R');
    if (y + h > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(headCells, y, headH, true, false);
      y += headH;
    }
    drawRow(cells, y, h, false, ri % 2 === 1);
    y += h;
  });
  if (!r.rows.length) {
    doc
      .font('R')
      .fontSize(fontSize)
      .fillColor('#666')
      .text('자료 없음', left, y + 6);
  }

  // 쪽 번호
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // 아래 여백 안에 쓰면 pdfkit이 새 쪽을 만든다 — 잠시 여백을 0으로
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('R')
      .fontSize(8)
      .fillColor('#999')
      .text(`${i + 1} / ${range.count}`, left, doc.page.height - margin + 12, {
        width,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return done;
}
