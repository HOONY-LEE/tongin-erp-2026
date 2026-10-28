import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderProps } from './PageHeader';

interface Props extends Omit<PageHeaderProps, 'children'> {
  /** 제목 아래 본문 — 보통 DataTable(검색 툴바 포함) */
  children: ReactNode;
  /** 화면 높이에 맞춘다 — 본문의 DataTable에도 fit을 줘야 표가 남은 높이 안에서 스크롤된다 */
  fit?: boolean;
}

/**
 * 목록 화면 공통 틀 — PageHeader + 본문을 세로로 16px 간격으로 쌓는다(.list-page).
 * 바깥 여백은 AppLayout 콘텐츠 영역(.contentInner)이 주므로 여기서 따로 padding을 두지 않는다.
 * 페이지가 Fragment(<>)로 PageHeader와 표를 바로 내보내면 콘텐츠 영역의 flex 자식이 되어
 * 간격 없이 붙어 버린다(마케팅 목록이 그랬다) — 목록 화면은 이 컴포넌트로 감싼다.
 */
export function ListPage({ children, fit, ...header }: Props) {
  return (
    <div className={fit ? 'list-page fit' : 'list-page'}>
      <PageHeader {...header} />
      {children}
    </div>
  );
}
