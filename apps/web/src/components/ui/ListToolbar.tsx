import type { ReactNode } from 'react';

/**
 * 목록 화면 공통 툴바(표 없는 보기 — 칸반·시간표 등). DataTable 툴바와 같은 자리:
 *   검색 · 필터 ……… 보기 바꾸기
 *   세그먼트 탭 ……… 생성 버튼
 * (제목 줄은 PageHeader: 제목 ……… 새로고침)
 */
export function ListToolbar({
  search,
  filters,
  viewSwitch,
  tabs,
  actions,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  viewSwitch?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // 탭이 없으면 셋째 줄을 접고 생성 버튼은 검색 줄 오른쪽 끝으로(DataTable과 같은 규칙)
    <div className={`list-toolbar ${tabs ? '' : 'no-row3'}`}>
      <div className="lt-search">{search}</div>
      {filters && <div className="lt-filters">{filters}</div>}
      {(viewSwitch || (!tabs && actions)) && (
        <div className="lt-view">
          {viewSwitch}
          {!tabs && actions}
        </div>
      )}
      {tabs && <div className="lt-tabs">{tabs}</div>}
      {tabs && actions && <div className="lt-actions">{actions}</div>}
    </div>
  );
}
