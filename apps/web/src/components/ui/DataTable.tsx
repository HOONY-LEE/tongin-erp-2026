import { useMemo, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Table, useTable, type ReactColumnDef } from 'softium-ui/table';
import type { Column, Row } from './types';

interface Props {
  columns: Column[];
  rows: Row[];
  loading?: boolean;
  rowKey?: string;
  /** 지정 시 로우 클릭으로 상세 이동 등 처리 (로우 안의 버튼/링크 클릭은 무시하고 그 자체 동작만 수행) */
  onRowClick?: (row: Row) => void;
  /** 툴바 오른쪽 끝에 배치할 커스텀 액션(예: "+ 등록" 버튼) — 내보내기 버튼 뒤에 온다 */
  toolbarActions?: ReactNode;
  /** 툴바 왼쪽, 검색창 바로 오른쪽에 붙는 필터 컨트롤(예: 상태 Select) */
  filters?: ReactNode;
  /** CSV/Excel/JSON/XML 내보내기 메뉴 노출 여부. 기본 false. */
  exportable?: boolean;
  /** 내보내기 파일명(확장자 제외). 기본 'table'. */
  exportFileName?: string;
  /** 한 페이지 행 수. 0을 주면 페이지 없이 전체를 그린다(상세 화면의 짧은 목록 등). */
  pageSize?: number;
}

/** 목록 화면 기본 페이지 크기. 푸터의 선택지(10/20/50/100) 중 하나여야 셀렉트와 값이 맞는다. */
const DEFAULT_PAGE_SIZE = 20;

/** 컬럼 정의로 렌더하는 공통 테이블 — softium-ui Table(정렬·검색·컬럼설정 내장) 기반. */
export function DataTable({
  columns,
  rows,
  loading,
  rowKey = 'id',
  onRowClick,
  toolbarActions,
  filters,
  exportable,
  exportFileName,
  pageSize = DEFAULT_PAGE_SIZE,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const softiumColumns: ReactColumnDef<Row>[] = useMemo(() => {
    const mapped: ReactColumnDef<Row>[] = columns.map((c, i) => ({
      key: c.dataIndex ?? `__col_${i}`,
      label: typeof c.title === 'string' ? c.title : String(c.title ?? ''),
      align: c.numeric ? 'right' : 'left',
      sortable: !!c.dataIndex,
      width: c.width,
      minWidth: c.minWidth,
      flex: c.flex,
      renderCell: ({ row }) =>
        c.render ? c.render(row.data) : String(row.data[c.dataIndex ?? ''] ?? ''),
    }));
    // 컬럼 폭 합이 컨테이너보다 좁으면(softium Table은 넘칠 때만 줄여주고 남을 때 안 늘려줌)
    // 오른쪽에 남는 여백이 생긴다. 실제 컬럼들을 억지로 늘리는 대신, 보이지 않는 여백 컬럼 하나를
    // 끝에 붙여 그 컬럼이 남는 폭을 가져가게 한다 — 단, 페이지가 이미 flex를 직접 지정했다면
    // (예: 주소처럼 넓혀야 할 컬럼이 있는 경우) 그 의도를 존중해 추가하지 않는다.
    if (!columns.some((c) => c.flex)) {
      mapped.push({
        key: '__spacer',
        label: '',
        flex: 1,
        sortable: false,
        filterable: false,
        hideable: false,
        exportValue: () => '',
        renderCell: () => null,
      });
    }
    return mapped;
  }, [columns]);

  const table = useTable<Row>({
    data: rows,
    columns: softiumColumns,
    getRowId: (r) => String(r[rowKey]),
    // 넘기지 않으면 softium Table이 페이지네이션을 끄고(전체 렌더) 푸터의
    // "N개씩 보기" 선택기도 감춘다.
    pageSize,
  });

  // softium-ui Table에는 아직 로우 클릭 prop이 없어 DOM 위임으로 처리한다.
  // 로우 안 버튼/링크 클릭은 그 자체 동작만 수행하도록 무시.
  const handleClick = onRowClick
    ? (e: MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button, input, select, textarea')) return;
        const rowEl = target.closest<HTMLElement>('.sft-tbody > [role="row"]');
        if (!rowEl?.parentElement) return;
        const index = Array.prototype.indexOf.call(rowEl.parentElement.children, rowEl);
        const row = table.getRows()[index];
        if (row) onRowClick(row.data);
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`dt-wrap${onRowClick ? ' dt-row-clickable' : ''}`}
    >
      <Table
        table={table}
        locale="ko"
        emptyText={loading ? '불러오는 중…' : '데이터가 없습니다'}
        toolbarActions={
          // softium Table의 툴바에는 왼쪽 확장 슬롯이 없다. toolbarActions는 오른쪽 컨테이너에
          // 그대로 펼쳐지므로, 필터를 Fragment 첫 자식으로 넣고 CSS(margin-right:auto)로
          // 검색창 옆까지 끌어와 "왼쪽=검색+필터 / 오른쪽=내보내기+액션" 배치를 만든다.
          <>
            {filters && <div className="dt-toolbar-filters">{filters}</div>}
            {toolbarActions}
          </>
        }
        exportable={exportable}
        exportFileName={exportFileName}
      />
    </div>
  );
}
