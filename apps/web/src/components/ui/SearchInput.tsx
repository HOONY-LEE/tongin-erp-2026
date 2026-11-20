import { useTranslation } from 'react-i18next';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Search } from 'lucide-react';

/**
 * 검색 입력 — 앱 전체 공용. 목록 표(DataTable) 위 검색과 똑같은 모양(같은 클래스)이라
 * 표가 없는 화면(칸반·목록·패널)에서도 검색칸이 하나로 보인다.
 * 칸을 누르면(포커스) 돋보기와 안내 글자가 사라지고 글자가 왼쪽 끝부터 들어간다(clean-theme.css).
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
  width,
  style,
  className,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** 칸 너비(px) — 비우면 놓인 자리만큼 */
  width?: number;
  style?: CSSProperties;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { t } = useTranslation();
  const ph = placeholder ?? t('ui.search');
  return (
    <div
      className={`sft-toolbar__search-wrap${className ? ` ${className}` : ''}`}
      style={{ ...(width ? { width } : {}), ...style }}
    >
      <span className="sft-toolbar__search-icon" aria-hidden="true">
        <Search size={15} />
      </span>
      <input
        className="sft-toolbar__search"
        type="search"
        value={value}
        placeholder={ph}
        aria-label={ariaLabel ?? ph}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
