import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './CopyText.module.css';

interface Props {
  /** 클립보드에 복사할 값. 화면 표시도 이 값을 쓴다(children으로 덮어쓸 수 있음). */
  value: string;
  children?: React.ReactNode;
}

/**
 * 값 + 호버 시 나타나는 복사 버튼.
 *
 * softium-ui의 CodeCopy를 쓰지 않은 이유: 그쪽은 값을 monospace로 그리고 복사 버튼이
 * 항상 보인다. 표에서는 다른 칼럼과 같은 서체·굵기로 보여야 하고, 버튼은 호버할 때만
 * 나와야 해서 별도로 둔다.
 */
export function CopyText({ value, children }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** 클립보드 권한이 없는 환경(비 HTTPS 등) 폴백. 성공 여부를 그대로 돌려준다. */
  const copyFallback = (text: string): boolean => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      // execCommand는 실패해도 예외 대신 false를 돌려준다 — 반환값을 반드시 봐야 한다.
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  };

  const copy = async (e: React.MouseEvent) => {
    // 표의 행 클릭(상세 열기)이 같이 발동하지 않도록.
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 복사에 실패했으면 성공 표시(체크)를 내지 않는다.
      if (!copyFallback(value)) return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <span className={styles.wrap}>
      <span className={styles.text}>{children ?? value}</span>
      <button
        type="button"
        className={[styles.button, copied ? styles.copied : ''].filter(Boolean).join(' ')}
        onClick={copy}
        title={copied ? '복사됨' : '복사'}
        aria-label={`${value} 복사`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  );
}
