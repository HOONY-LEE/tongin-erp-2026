import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Link2,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import type { DriveItemView } from '@tongin/shared';
import { ApiError, getToken, toApiError } from './api';

/** 파일 종류 → 아이콘·색(구글 드라이브처럼 종류마다 색을 달리) */
export function fileIcon(item: Pick<DriveItemView, 'kind' | 'mimeType' | 'name'>): {
  Icon: LucideIcon;
  color: string;
} {
  if (item.kind === 'FOLDER') return { Icon: Folder, color: 'var(--drive-folder, #5f6368)' };
  const m = item.mimeType ?? '';
  const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
  if (
    m.includes('google-apps.document') ||
    /word|msword/.test(m) ||
    ['doc', 'docx', 'hwp', 'hwpx'].includes(ext)
  )
    return { Icon: FileText, color: '#4285f4' };
  if (
    m.includes('google-apps.spreadsheet') ||
    /sheet|excel|csv/.test(m) ||
    ['xls', 'xlsx', 'csv'].includes(ext)
  )
    return { Icon: FileSpreadsheet, color: '#0f9d58' };
  if (
    m.includes('google-apps.presentation') ||
    /presentation|powerpoint/.test(m) ||
    ['ppt', 'pptx'].includes(ext)
  )
    return { Icon: Presentation, color: '#f4b400' };
  if (m === 'application/pdf' || ext === 'pdf') return { Icon: FileText, color: '#ea4335' };
  if (m.startsWith('image/')) return { Icon: FileImage, color: '#d93025' };
  if (m.startsWith('video/')) return { Icon: FileVideo, color: '#d93025' };
  if (m.startsWith('audio/')) return { Icon: FileAudio, color: '#9334e6' };
  if (/zip|compressed|tar|rar|7z/.test(m) || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { Icon: FileArchive, color: '#5f6368' };
  if (/json|javascript|xml|html/.test(m)) return { Icon: FileCode, color: '#5f6368' };
  if (item.kind === 'LINK') return { Icon: Link2, color: '#4285f4' };
  return { Icon: File, color: '#5f6368' };
}

/** 창 안에서 미리 볼 수 있는 종류(그 밖은 받기) — HTML 같은 실행되는 문서는 열지 않는다 */
export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | null;
export function previewKind(mime: string | null, name: string): PreviewKind {
  const m = mime ?? '';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (/^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|avif)$/.test(m)) return 'image';
  if (m === 'application/pdf') return 'pdf';
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(m)) return 'video';
  if (/^audio\//.test(m)) return 'audio';
  if (
    m.startsWith('text/plain') ||
    m === 'text/csv' ||
    m === 'application/json' ||
    ['txt', 'csv', 'md', 'log', 'json'].includes(ext)
  )
    return 'text';
  return null;
}

/** 파일 내용을 받는다(인증 fetch) */
export async function fetchDriveFile(id: string): Promise<Blob> {
  const token = getToken();
  const path = `/drive/items/${id}/content`;
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await toApiError(res, path);
  return res.blob();
}

export async function downloadDriveFile(item: Pick<DriveItemView, 'id' | 'name'>) {
  const blob = await fetchDriveFile(item.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 파일 하나 올리기 — 진행률을 알려 준다(XHR). 이름·종류는 헤더로 */
export function uploadDriveFile(
  file: File,
  target: { spaceId: string; parentId: string | null },
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ spaceId: target.spaceId });
    if (target.parentId) qs.set('parentId', target.parentId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/drive/upload?${qs.toString()}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-File-Type', encodeURIComponent(file.type || ''));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as { id: string });
        return;
      }
      let message = '올리지 못했습니다';
      try {
        message = (JSON.parse(xhr.responseText) as { message?: string }).message ?? message;
      } catch {
        if (xhr.status === 413) message = '파일이 너무 큽니다';
      }
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () => reject(new ApiError(0, '서버에 연결하지 못했습니다'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.onabort = () => reject(new ApiError(0, '올리기를 취소했습니다'));
    xhr.send(file);
  });
}

/** 날짜 글자 — 오늘이면 시각, 올해면 월·일, 아니면 연·월·일 */
export function driveDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ── 폴더째 올리기 — 컴퓨터의 폴더 구조를 그대로 드라이브에 만든다 ── */

/** 올릴 파일과 그 파일이 들어갈 폴더 경로('사진/2026', 맨 위는 '') + 비어 있는 폴더까지 포함한 폴더 경로 목록 */
export interface FolderPick {
  files: { file: File; dir: string }[];
  dirs: string[];
}

/** <input webkitdirectory>로 고른 파일 — webkitRelativePath에 '고른폴더/하위/파일' 경로가 들어 있다 */
export function pickFromDirectoryInput(list: File[]): FolderPick {
  const dirs = new Set<string>();
  const files = list.map((file) => {
    const parts = (file.webkitRelativePath || file.name).split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    return { file, dir: parts.join('/') };
  });
  return { files, dirs: [...dirs] };
}

/**
 * 끌어다 놓은 것 읽기 — 폴더가 섞여 있으면 안까지 훑는다.
 * 브라우저가 놓은 직후에만 항목을 꺼낼 수 있어서, 이 함수는 drop 처리 안에서 바로(await 전에) 불러야 한다.
 */
export function readDropped(dt: DataTransfer): Promise<FolderPick> {
  const entries = [...dt.items]
    .map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.some((e) => e.isDirectory))
    return Promise.resolve({ files: [...dt.files].map((file) => ({ file, dir: '' })), dirs: [] });

  const files: FolderPick['files'] = [];
  const dirs: string[] = [];
  const fileOf = (e: FileSystemFileEntry) => new Promise<File>((res, rej) => e.file(res, rej));
  // 한 번에 100개씩 나눠 주므로 빈 배열이 올 때까지 읽는다
  const readAll = async (d: FileSystemDirectoryEntry) => {
    const reader = d.createReader();
    const out: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
        reader.readEntries(res, rej),
      );
      if (!batch.length) return out;
      out.push(...batch);
    }
  };
  const walk = async (e: FileSystemEntry, dir: string): Promise<void> => {
    if (e.isFile) {
      files.push({ file: await fileOf(e as FileSystemFileEntry), dir });
    } else if (e.isDirectory) {
      const path = dir ? `${dir}/${e.name}` : e.name;
      dirs.push(path);
      for (const child of await readAll(e as FileSystemDirectoryEntry)) await walk(child, path);
    }
  };
  return Promise.all(entries.map((e) => walk(e, ''))).then(() => ({ files, dirs }));
}
