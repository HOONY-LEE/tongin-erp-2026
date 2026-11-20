import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { tDyn } from '../../i18n';
import { fmtDateTime } from '../../lib/dateFormat';
import { createPortal } from 'react-dom';
import { ExternalLink, History, Printer, X } from 'lucide-react';
import { api, ApiError, getToken } from '../../lib/api';
import { APPLE } from '../../lib/palette';
import { Spinner } from './index';
import { StatusChip } from './StatusChip';
import styles from './DocumentViewer.module.css';

/** 계약서 수정 이력 한 줄(서버 /estimates/:id/revisions) */
interface Revision {
  id: string;
  seq: number;
  kind: string;
  summary: string | null;
  changes: { label: string; from: string; to: string; price: boolean }[];
  byName: string | null;
  createdAt: string;
  hasDocument: boolean;
  approval: { docNo: string; status: string } | null;
}

/** 이력 종류 색 — 이름은 ui.doc.kind.* */
const KIND_COLOR: Record<string, string> = {
  BASE: APPLE.gray,
  EDIT: APPLE.blue,
  PRICE_REQUEST: APPLE.orange,
  PRICE_APPROVED: APPLE.green,
  PRICE_REJECTED: APPLE.red,
  PRICE_CANCELED: APPLE.gray,
};
const when = (iso: string) => fmtDateTime(iso);

/** 인증 fetch로 문서(HTML)를 받는다 */
async function fetchHtml(path: string) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? i18n.t('ui.doc.loadFailed'));
  }
  return res.text();
}

/**
 * 문서 보기 창 — 계약서·견적서 같은 A4 문서를 PDF 뷰어처럼 크게 띄운다.
 * 서버가 그린 문서(HTML)를 받아 창 안에 그대로 보여 주고, 'PDF 저장'은 인쇄 창(PDF로 저장)을 연다
 * — 저장 파일 이름은 fileName(예: 계약서_홍길동_CT2611200001).
 * estimatePath를 주면 '수정 이력'(누가·언제·무엇을)을 옆에 펼치고, 이력을 누르면 그때 계약서를 본다.
 */
export function DocumentViewer({
  path,
  title,
  fileName,
  estimatePath,
  onClose,
}: {
  /** 문서 주소(/estimates/:id/document 등) */
  path: string;
  title: string;
  /** PDF로 저장할 때 파일 이름(확장자 없이) */
  fileName?: string;
  /** 수정 이력을 보여 줄 견적 주소(/estimates/:id) */
  estimatePath?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  /** 지금 보고 있는 이력(없으면 현재 계약서) */
  const [viewing, setViewing] = useState<Revision | null>(null);

  const docPath =
    viewing && estimatePath ? `${estimatePath}/revisions/${viewing.id}/document` : path;

  useEffect(() => {
    let alive = true;
    setHtml(null);
    setError(null);
    fetchHtml(docPath)
      .then((h) => alive && setHtml(h))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [docPath]);

  useEffect(() => {
    if (!historyOpen || revisions || !estimatePath) return;
    api<{ revisions: Revision[] }>(`${estimatePath}/revisions`)
      .then((r) => setRevisions(r.revisions))
      .catch(() => setRevisions([]));
  }, [historyOpen, revisions, estimatePath]);

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

  /** 저장 파일 이름 — 이력 문서면 뒤에 '_수정N' */
  const revLabel = (r: Revision) =>
    r.kind === 'BASE' ? t('ui.doc.revFirst') : t('ui.doc.revN', { n: r.seq });
  const saveName = fileName ? `${fileName}${viewing ? `_${revLabel(viewing)}` : ''}` : title;
  const esc = (t: string) => t.replace(/[<>&]/g, '');
  // 문서 안의 자체 인쇄 막대는 숨기고(이 창 위쪽 막대에 같은 버튼), 제목을 저장 파일 이름으로
  const doc = html
    ?.replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(
      '</head>',
      `<title>${esc(saveName)}</title><style>.toolbar{display:none!important}</style></head>`,
    );

  /** 인쇄 창의 'PDF로 저장' 파일 이름은 문서 제목을 따른다 — 잠깐 바깥 제목도 같이 바꾼다 */
  const print = () => {
    const prev = document.title;
    document.title = saveName;
    frame.current?.contentWindow?.print();
    setTimeout(() => (document.title = prev), 1000);
  };

  const openNew = () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`${styles.viewer} ${historyOpen ? styles.viewerWide : ''}`}
        role="dialog"
        aria-label={title}
      >
        <header className={styles.bar}>
          <b>{title}</b>
          <div className={styles.actions}>
            {estimatePath && (
              <button
                type="button"
                className={historyOpen ? styles.on : undefined}
                onClick={() => setHistoryOpen((v) => !v)}
                aria-pressed={historyOpen}
              >
                <History size={15} aria-hidden />
                {t('ui.doc.history')}
              </button>
            )}
            <button type="button" disabled={!html} onClick={print} title={t('ui.doc.printTip')}>
              <Printer size={15} aria-hidden />
              {t('ui.doc.print')}
            </button>
            <button type="button" disabled={!html} onClick={openNew}>
              <ExternalLink size={15} aria-hidden />
              {t('ui.doc.newWindow')}
            </button>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label={t('ui.close')}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className={styles.main}>
          <div className={styles.body}>
            {viewing && (
              <div className={styles.past}>
                <span>
                  {t('ui.doc.pastNotice', {
                    when: when(viewing.createdAt),
                    rev: revLabel(viewing),
                  })}
                </span>
                <button type="button" onClick={() => setViewing(null)}>
                  {t('ui.doc.viewCurrent')}
                </button>
              </div>
            )}
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
          {historyOpen && (
            <aside className={styles.history} aria-label={t('ui.doc.history')}>
              <h3>{t('ui.doc.history')}</h3>
              {!revisions ? (
                <div className={styles.historyMsg}>
                  <Spinner size="sm" />
                </div>
              ) : revisions.length === 0 ? (
                <p className={styles.historyMsg}>{t('ui.doc.noHistory')}</p>
              ) : (
                <ol className={styles.revList}>
                  {revisions.map((r) => {
                    const k = {
                      label: tDyn(`ui.doc.kind.${r.kind}`, r.kind),
                      color: KIND_COLOR[r.kind] ?? APPLE.gray,
                    };
                    return (
                      <li
                        key={r.id}
                        className={`${styles.rev} ${viewing?.id === r.id ? styles.revOn : ''}`}
                      >
                        <div className={styles.revHead}>
                          <StatusChip color={k.color}>{k.label}</StatusChip>
                          <span className={styles.revWho}>
                            {r.byName ?? (r.kind === 'BASE' ? t('ui.doc.original') : '-')}
                          </span>
                          <time className="id-mono">{when(r.createdAt)}</time>
                        </div>
                        {r.approval && (
                          <div className={styles.revMeta}>
                            {t('ui.doc.approval')}{' '}
                            <span className="id-mono">{r.approval.docNo}</span> ·{' '}
                            {tDyn(`ui.doc.approvalStatus.${r.approval.status}`, r.approval.status)}
                          </div>
                        )}
                        {r.summary && r.kind === 'BASE' && (
                          <div className={styles.revMeta}>{r.summary}</div>
                        )}
                        {r.changes.length > 0 && (
                          <ul className={styles.changes}>
                            {r.changes.map((c) => (
                              <li key={c.label}>
                                <b>{c.label}</b>
                                <span>
                                  <s>{c.from}</s> →{' '}
                                  <em className={c.price ? styles.price : ''}>{c.to}</em>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {r.hasDocument && (
                          <button
                            type="button"
                            className={styles.revView}
                            onClick={() => setViewing(viewing?.id === r.id ? null : r)}
                          >
                            {viewing?.id === r.id ? t('ui.doc.viewCurrent') : t('ui.doc.viewThis')}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
