import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Printer, X } from 'lucide-react';
import { ApiError, getToken } from '../../lib/api';
import { Spinner } from './index';
import styles from './DocumentViewer.module.css';

/**
 * 문서 보기 창 — 계약서·견적서 같은 A4 문서를 PDF 뷰어처럼 크게 띄운다.
 * 서버가 그린 문서(HTML)를 받아 창 안에 그대로 보여 주고, 'PDF 저장'은 인쇄 창(PDF로 저장)을 연다.
 */
export function DocumentViewer({
  path,
  title,
  onClose,
}: {
  /** 문서 주소(/estimates/:id/document 등) */
  path: string;
  title: string;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const token = getToken();
    fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new ApiError(res.status, body?.message ?? '문서를 불러오지 못했습니다');
        }
        return res.text();
      })
      .then((h) => alive && setHtml(h))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // 문서 안의 자체 인쇄 막대는 숨긴다(이 창 위쪽 막대에 같은 버튼이 있다)
  const doc = html?.replace('</head>', '<style>.toolbar{display:none!important}</style></head>');

  const openNew = () => {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.viewer} role="dialog" aria-label={title}>
        <header className={styles.bar}>
          <b>{title}</b>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={!html}
              onClick={() => frame.current?.contentWindow?.print()}
              title="인쇄 창에서 'PDF로 저장'을 고르면 PDF 파일로 저장됩니다"
            >
              <Printer size={15} aria-hidden />
              PDF 저장 · 인쇄
            </button>
            <button type="button" disabled={!html} onClick={openNew}>
              <ExternalLink size={15} aria-hidden />새 창
            </button>
            <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className={styles.body}>
          {error ? (
            <p className={styles.msg}>{error}</p>
          ) : !doc ? (
            <div className={styles.msg}>
              <Spinner size="md" />
            </div>
          ) : (
            <iframe
              ref={frame}
              title={title}
              srcDoc={doc}
              // 문서 안 스크립트는 막고(같은 출처라 인쇄만 바깥에서 부른다)
              sandbox="allow-same-origin allow-modals"
              className={styles.frame}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
