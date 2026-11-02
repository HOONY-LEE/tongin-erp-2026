import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Download, ExternalLink, Link2, LogOut } from 'lucide-react';
import { formatBytes, type GoogleDriveFile } from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { driveDate, fileIcon } from '../../lib/drive';
import { Button, useToast } from '../ui';
import { ChoiceChips } from '../approval/FormsAdmin';
import { FolderPickerModal } from './DriveModals';
import styles from './drive.module.css';

interface Status {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
}

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** 구글 로고 대신 쓰는 작은 표시(색 네 개) */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className ?? styles.gIcon} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * 구글 드라이브 — 내 구글 계정을 연결해 둘러보고, 고른 파일을
 *  드라이브로 가져오기(복사, 구글 문서는 오피스 파일로) · 링크로 넣기 · 구글에서 열기.
 */
export function GoogleDrivePanel({
  query,
  onChanged,
}: {
  /** 위 검색칸 글자 — 있으면 구글 드라이브에서 찾는다 */
  query: string;
  /** 가져오기·링크 뒤 왼쪽 용량 등을 새로 읽게 */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [view, setView] = useState<'mine' | 'shared'>('mine');
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [picking, setPicking] = useState<'import' | 'link' | null>(null);

  const loadStatus = useCallback(() => {
    api<Status>('/drive/google/status')
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false, googleEmail: null }));
  }, []);
  useEffect(loadStatus, [loadStatus]);

  const folderId = stack[stack.length - 1]?.id;
  const load = useCallback(
    async (pageToken?: string) => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (query.trim()) qs.set('q', query.trim());
      else if (folderId) qs.set('folderId', folderId);
      else if (view === 'shared') qs.set('view', 'shared');
      if (pageToken) qs.set('pageToken', pageToken);
      try {
        const r = await api<{ files: GoogleDriveFile[]; nextPageToken: string | null }>(
          `/drive/google/files?${qs.toString()}`,
        );
        setFiles((cur) => (pageToken ? [...cur, ...r.files] : r.files));
        setNext(r.nextPageToken);
      } catch (e) {
        setError(errText(e, '구글 드라이브를 읽지 못했습니다'));
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [query, folderId, view],
  );
  useEffect(() => {
    if (status?.connected) void load();
  }, [status?.connected, load]);

  const connect = async () => {
    try {
      const { url } = await api<{ url: string }>('/drive/google/auth-url');
      window.location.href = url;
    } catch (e) {
      toast({ type: 'error', title: errText(e, '연결을 시작하지 못했습니다') });
    }
  };
  const disconnect = async () => {
    try {
      await api('/drive/google', { method: 'DELETE' });
      toast({ type: 'success', title: '구글 드라이브 연결을 끊었습니다' });
      setStack([]);
      loadStatus();
    } catch (e) {
      toast({ type: 'error', title: errText(e, '끊지 못했습니다') });
    }
  };

  if (!status) return <div className={styles.empty}>불러오는 중…</div>;
  if (!status.configured)
    return (
      <div className={styles.googleCard}>
        <GoogleMark className={styles.gIcon} />
        <span className={styles.emptyTitle}>구글 연동이 아직 설정되지 않았습니다</span>
        <span>관리자에게 구글 연동(GOOGLE_CLIENT_ID/SECRET) 설정을 요청하세요.</span>
      </div>
    );
  if (!status.connected)
    return (
      <div className={styles.googleCard}>
        <GoogleMark className={styles.gIcon} />
        <span className={styles.emptyTitle}>구글 드라이브 연결</span>
        <span>
          내 구글 계정을 연결하면 구글 드라이브 파일을 여기서 보고, 드라이브로 가져오거나 링크로
          넣을 수 있습니다. 드라이브 파일을 구글 드라이브로 보낼 수도 있습니다.
        </span>
        <Button variant="primary" onClick={() => void connect()}>
          구글 계정 연결
        </Button>
        <span className={styles.muted}>연결은 나에게만 적용됩니다. 언제든 끊을 수 있습니다.</span>
      </div>
    );

  const selected = files.find((f) => f.id === sel) ?? null;
  const open = (f: GoogleDriveFile) => {
    if (f.isFolder) {
      setStack((s) => [...s, { id: f.id, name: f.name }]);
      setSel(null);
    } else if (f.webViewLink) window.open(f.webViewLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className={styles.head}>
        <div className={styles.crumbs}>
          <button
            type="button"
            className={`${styles.crumb} ${!stack.length ? styles.crumbLast : ''}`}
            onClick={() => {
              setStack([]);
              setSel(null);
            }}
          >
            {query.trim()
              ? '구글 드라이브 검색'
              : view === 'shared'
                ? '구글 공유 문서함'
                : '구글 드라이브'}
          </button>
          {stack.map((f, i) => (
            <span key={f.id} style={{ display: 'contents' }}>
              <ChevronRight size={18} className={styles.crumbSep} />
              <button
                type="button"
                className={`${styles.crumb} ${i === stack.length - 1 ? styles.crumbLast : ''}`}
                onClick={() => setStack((s) => s.slice(0, i + 1))}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
        <span className={styles.googleAccount}>
          <GoogleMark />
          {status.googleEmail}
          <button
            type="button"
            className={styles.iconBtn}
            title="연결 끊기"
            aria-label="구글 드라이브 연결 끊기"
            onClick={() => void disconnect()}
          >
            <LogOut size={16} />
          </button>
        </span>
      </div>
      {!stack.length && !query.trim() && (
        <div style={{ marginBottom: 8 }}>
          <ChoiceChips
            value={view}
            onChange={(v) => setView(v as 'mine' | 'shared')}
            options={[
              { value: 'mine', label: '내 드라이브' },
              { value: 'shared', label: '공유 문서함' },
            ]}
          />
        </div>
      )}
      {selected && !selected.isFolder && (
        <div className={styles.selBar}>
          <span className={styles.selCount}>{selected.name}</span>
          <Button variant="ghost" size="sm" onClick={() => setPicking('import')}>
            <Download size={16} /> 드라이브로 가져오기
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPicking('link')}>
            <Link2 size={16} /> 링크로 넣기
          </Button>
          {selected.webViewLink && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(selected.webViewLink!, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink size={16} /> 구글에서 열기
            </Button>
          )}
        </div>
      )}
      {error ? (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>구글 드라이브를 읽지 못했습니다</span>
          <span>{error}</span>
          <Button variant="outline" onClick={() => void connect()}>
            다시 연결
          </Button>
        </div>
      ) : !loading && !files.length ? (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>
            {query.trim() ? '찾은 파일이 없습니다' : '비어 있습니다'}
          </span>
        </div>
      ) : (
        <div className={styles.list} role="listbox" aria-label="구글 드라이브 파일">
          <div className={`${styles.row} ${styles.rowHead}`}>
            <span>이름</span>
            <span>종류</span>
            <span>수정한 날짜</span>
            <span>크기</span>
          </div>
          {files.map((f) => {
            const { Icon, color } = fileIcon({
              kind: f.isFolder ? 'FOLDER' : 'FILE',
              mimeType: f.mimeType,
              name: f.name,
            });
            return (
              <div
                key={f.id}
                role="option"
                aria-selected={sel === f.id}
                tabIndex={0}
                className={`${styles.row} ${sel === f.id ? styles.rowSel : ''}`}
                onClick={() => setSel(f.id)}
                onDoubleClick={() => open(f)}
                onKeyDown={(e) => e.key === 'Enter' && open(f)}
              >
                <span className={styles.nameCell}>
                  {f.iconLink && !f.isFolder ? (
                    <img src={f.iconLink} alt="" width={18} height={18} />
                  ) : (
                    <Icon size={20} color={color} aria-hidden />
                  )}
                  <span className={styles.nameText}>{f.name}</span>
                </span>
                <span className={styles.cell}>{f.isFolder ? '폴더' : googleKind(f.mimeType)}</span>
                <span className={styles.cell}>
                  {f.modifiedTime ? driveDate(f.modifiedTime) : '—'}
                </span>
                <span className={styles.cell}>{f.isFolder ? '—' : formatBytes(f.size)}</span>
              </div>
            );
          })}
          {loading && (
            <div className={styles.empty} style={{ minHeight: 80 }}>
              불러오는 중…
            </div>
          )}
          {next && !loading && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <Button variant="outline" size="sm" onClick={() => void load(next)}>
                더 보기
              </Button>
            </div>
          )}
        </div>
      )}
      {picking && selected && (
        <FolderPickerModal
          title={
            picking === 'import'
              ? `'${selected.name}' 가져올 곳`
              : `'${selected.name}' 링크를 넣을 곳`
          }
          confirmLabel={picking === 'import' ? '여기로 가져오기' : '여기에 넣기'}
          onClose={() => setPicking(null)}
          onConfirm={async (target) => {
            try {
              await api(`/drive/google/${picking}`, {
                method: 'POST',
                body: JSON.stringify({
                  fileId: selected.id,
                  ...target,
                  parentId: target.parentId ?? undefined,
                }),
              });
              toast({
                type: 'success',
                title: picking === 'import' ? '드라이브로 가져왔습니다' : '링크를 넣었습니다',
              });
              setPicking(null);
              onChanged();
            } catch (e) {
              toast({ type: 'error', title: errText(e, '처리하지 못했습니다') });
            }
          }}
        />
      )}
    </>
  );
}

function googleKind(mime: string): string {
  if (mime.includes('google-apps.document')) return '구글 문서';
  if (mime.includes('google-apps.spreadsheet')) return '구글 스프레드시트';
  if (mime.includes('google-apps.presentation')) return '구글 프레젠테이션';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return '이미지';
  if (mime.startsWith('video/')) return '동영상';
  return mime.split('/').pop()?.slice(0, 20) ?? '파일';
}
