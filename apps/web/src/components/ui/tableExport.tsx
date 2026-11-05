import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronDown, Download, EyeOff } from 'lucide-react';
import { buildExportTable, downloadTableExport, type TableInstance } from 'softium-ui/table';
import { api } from '../../lib/api';

/** 가릴 수 있는 칸 — 표 내보내기·가리기 메뉴가 같이 쓴다 */
export interface MaskableColumn {
  key: string;
  label: string;
}

/**
 * 화면에 그린 셀 내용 → 글자. 표 내보내기가 원본 필드만 읽어서, 화면에서 따로 그리는 칸
 * (고객명·전화번호·주소·상태 배지 등)이 비거나 코드값(WORK_TOSS)으로 나가던 것을 막는다.
 * 정적 HTML로 그린 뒤 DOMParser로 글자만 뽑는다(DOMParser 문서는 스크립트·이미지를 실행·로드하지 않는다).
 * 라우터 등 컨텍스트가 필요한 컴포넌트는 그리지 못하면 빈 값 — 그런 칸은 Column.exportValue로 지정한다.
 */
let parser: DOMParser | null = null;
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  try {
    const html = renderToStaticMarkup(<>{node}</>);
    parser ??= new DOMParser();
    return (parser.parseFromString(html, 'text/html').body.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

type Cell = string | number | boolean | null | undefined;

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈은 따옴표로 감싸고, 수식으로 읽힐 값(=,+,@)은 앞에 '를 붙인다 */
const csvCell = (v: Cell) => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV 내려받기 — 맨 앞에 UTF-8 BOM을 붙인다. BOM이 없으면 한국어 윈도우 엑셀이 CP949로 읽어
 * 한글이 전부 깨진다(라이브러리 기본 CSV가 그랬다). 화면 여백용 빈 칸(__spacer)은 뺀다.
 */
function downloadCsv<T>(table: TableInstance<T>, fileName: string) {
  const { headers, rows } = buildExportTable(table);
  const keys = table.getRenderColumns().map((c) => c.key);
  const keep = keys.map((k) => k !== '__spacer');
  const pick = <T,>(r: T[]) => r.filter((_, i) => keep[i]);
  const lines = [pick(headers), ...rows.map(pick)].map((r) => r.map(csvCell).join(','));
  const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const FORMATS = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'json', label: 'JSON' },
  { format: 'xml', label: 'XML' },
] as const;

/** 메뉴 밖을 누르면 닫는다 */
function useCloseOnOutside(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return rootRef;
}

/** 가릴 칸 체크 목록 — 내보내기·가리기 메뉴 공통 */
function MaskChecks({
  columns,
  checked,
  onChange,
}: {
  columns: MaskableColumn[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <>
      {columns.map((c) => (
        <label key={c.key} className="dt-mask-row">
          <input
            type="checkbox"
            checked={checked.has(c.key)}
            onChange={(e) => {
              const next = new Set(checked);
              if (e.target.checked) next.add(c.key);
              else next.delete(c.key);
              onChange(next);
            }}
          />
          <span>{c.label}</span>
        </label>
      ))}
    </>
  );
}

/**
 * 내보내기 메뉴 — softium 기본 메뉴와 같은 모양(같은 CSS 클래스)이고, CSV만 BOM을 붙여 직접 만든다.
 * Excel(.xlsx)·JSON·XML은 라이브러리 그대로(UTF-8로 잘 열린다).
 * 전화·주소·이름 칸은 '가려서 받기'를 고를 수 있다(처음엔 화면에서 가린 칸이 골라져 있다).
 * 내려받으면 누가 어느 화면에서 몇 건·어떤 칸을 받았는지 접근 기록에 남긴다.
 */
export function ExportMenu<T>({
  table,
  fileName = 'table',
  maskable = [],
  screenMasked,
  exportMask,
}: {
  table: TableInstance<T>;
  fileName?: string;
  maskable?: MaskableColumn[];
  /** 지금 화면에서 가린 칸 — 메뉴를 열 때 '가려서 받기'의 처음 값 */
  screenMasked?: Set<string>;
  /** 내보내는 동안 가릴 칸을 표 칸(exportValue)에 알려 주는 자리 */
  exportMask?: MutableRefObject<Set<string> | null>;
}) {
  const [open, setOpen] = useState(false);
  const [mask, setMask] = useState<Set<string>>(new Set());
  const rootRef = useCloseOnOutside(open, () => setOpen(false));

  const download = (format: (typeof FORMATS)[number]['format']) => {
    if (exportMask) exportMask.current = mask;
    try {
      const { headers, rows } = buildExportTable(table);
      const keys = table.getRenderColumns().map((c) => c.key);
      if (format === 'csv') downloadCsv(table, fileName);
      else downloadTableExport(table, format, { fileName });
      const columns = headers.filter((_, i) => keys[i] !== '__spacer').map(String);
      void api('/access-logs/export', {
        method: 'POST',
        body: JSON.stringify({
          screen: window.location.pathname,
          fileName,
          format,
          rowCount: rows.length,
          columns,
          masked: maskable.filter((c) => mask.has(c.key)).map((c) => c.label),
        }),
      }).catch(() => undefined);
    } finally {
      if (exportMask) exportMask.current = null;
    }
    setOpen(false);
  };

  return (
    <div className="sft-export" ref={rootRef}>
      <button
        type="button"
        className="sft-export__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) setMask(new Set(screenMasked ?? []));
          setOpen((v) => !v);
        }}
      >
        <Download size={15} />
        <span>내보내기</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="sft-export__menu" role="menu">
          {maskable.length > 0 && (
            <div className="dt-mask-section">
              <div className="dt-mask-title">가려서 받기</div>
              <MaskChecks columns={maskable} checked={mask} onChange={setMask} />
            </div>
          )}
          {FORMATS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              className="sft-export__item"
              role="menuitem"
              onClick={() => download(format)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 화면에서 가리기 — 전화·주소·이름 칸을 골라 표에 가려 보인다(기본은 다 보임, 화면마다 기억) */
export function MaskMenu({
  maskable,
  masked,
  onChange,
}: {
  maskable: MaskableColumn[];
  masked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useCloseOnOutside(open, () => setOpen(false));
  const on = masked.size > 0;
  return (
    <div className="sft-export" ref={rootRef}>
      <button
        type="button"
        className={['sft-export__trigger', on ? 'dt-mask-on' : ''].filter(Boolean).join(' ')}
        aria-haspopup="menu"
        aria-expanded={open}
        title="전화번호·주소·이름 가리기"
        onClick={() => setOpen((v) => !v)}
      >
        <EyeOff size={15} />
        <span>{on ? `가림 ${masked.size}` : '가리기'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="sft-export__menu" role="menu">
          <div className="dt-mask-section">
            <div className="dt-mask-title">화면에서 가릴 칸</div>
            <MaskChecks columns={maskable} checked={masked} onChange={onChange} />
          </div>
          <button
            type="button"
            className="sft-export__item"
            onClick={() =>
              onChange(
                masked.size === maskable.length ? new Set() : new Set(maskable.map((c) => c.key)),
              )
            }
          >
            {masked.size === maskable.length ? '모두 보이기' : '모두 가리기'}
          </button>
        </div>
      )}
    </div>
  );
}
