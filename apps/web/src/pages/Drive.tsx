import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FolderInput,
  FolderPlus,
  FolderSearch,
  HardDrive,
  Info,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Star,
  StarOff,
  Trash2,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { ContextMenu, Menu, type ContextMenuEntry, type MenuEntry } from '@sunghoon_lee/akron-ui';
import {
  DRIVE_FILE_MAX_BYTES,
  DRIVE_ROLE_RANK,
  DRIVE_TRASH_DAYS,
  formatBytes,
  type DriveItemView,
  type DriveRole,
  type DriveSpaceView,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import {
  downloadDriveFile,
  driveDate,
  fetchDriveFile,
  fileIcon,
  previewKind,
  uploadDriveFile,
} from '../lib/drive';
import { Button, useToast } from '../components/ui';
import {
  MoveModal,
  NameModal,
  PreviewModal,
  ShareModal,
  SpaceModal,
  openLink,
} from '../components/drive/DriveModals';
import { GoogleDrivePanel, GoogleMark } from '../components/drive/GoogleDrivePanel';
import styles from '../components/drive/drive.module.css';

type View = 'recent' | 'starred' | 'shared' | 'trash' | 'google';
const VIEW_TITLE: Record<View, string> = {
  recent: '최근 문서함',
  starred: '중요 문서함',
  shared: '공유 문서함',
  trash: '휴지통',
  google: '구글 드라이브',
};
const LAYOUT_KEY = 'tongin.drive.layout';

interface Listing {
  space: { id: string; name: string; kind: string };
  path: { id: string; name: string }[];
  role: DriveRole;
  items: DriveItemView[];
}
interface Upload {
  key: string;
  name: string;
  progress: number;
  status: 'wait' | 'up' | 'done' | 'error';
  error?: string;
}

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const canEdit = (r: DriveRole | null | undefined) =>
  !!r && DRIVE_ROLE_RANK[r] >= DRIVE_ROLE_RANK.EDITOR;
const readLayout = (): 'list' | 'grid' => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};

/**
 * 드라이브 — 구글 드라이브처럼.
 *  왼쪽: 새로 만들기 · 내 드라이브 · 공유 문서함 · 최근 · 중요 · 휴지통 · 공유 드라이브 · 조직 드라이브 · 구글 드라이브
 *  오른쪽: 찾기 · 경로 · 목록/바둑판 · 고르기(클릭, ⌘/Ctrl·Shift로 여럿) · 열기(두 번 클릭) · 오른쪽 클릭 메뉴 · 끌어다 놓아 올리기·옮기기
 * 주소: ?space=&folder= 또는 ?view=recent|starred|shared|trash|google, 찾기는 &q=
 */
export default function Drive() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') as View | null;
  const spaceParam = params.get('space');
  const folderId = params.get('folder');
  const q = params.get('q') ?? '';

  const [spaces, setSpaces] = useState<DriveSpaceView[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [viewItems, setViewItems] = useState<DriveItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [layout, setLayout] = useState<'list' | 'grid'>(readLayout);
  const [search, setSearch] = useState(q);
  const [dragOver, setDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<DriveItemView | null>(null);
  const [naming, setNaming] = useState<
    { kind: 'folder' } | { kind: 'rename'; item: DriveItemView } | null
  >(null);
  const [sharing, setSharing] = useState<DriveItemView | null>(null);
  const [moving, setMoving] = useState<DriveItemView[] | null>(null);
  const [spaceModal, setSpaceModal] = useState<{ id: string | null } | null>(null);

  const personal = spaces.find((s) => s.kind === 'PERSONAL');
  const spaceId = view ? null : (spaceParam ?? personal?.id ?? null);
  const space = spaces.find((s) => s.id === spaceId) ?? null;
  const searching = !!q.trim() && view !== 'google';

  // 주소 바꾸기 — 다른 곳으로 가면 고른 것·찾기를 비운다
  const go = useCallback(
    (next: { space?: string | null; folder?: string | null; view?: View | null; q?: string }) => {
      const n = new URLSearchParams();
      if (next.view) n.set('view', next.view);
      if (next.space) n.set('space', next.space);
      if (next.folder) n.set('folder', next.folder);
      if (next.q) n.set('q', next.q);
      setParams(n);
      setSel(new Set());
      if (next.q === undefined) setSearch('');
    },
    [setParams],
  );

  const loadSpaces = useCallback(async () => {
    try {
      setSpaces(await api<DriveSpaceView[]>('/drive/spaces'));
    } catch (e) {
      toast({ type: 'error', title: errText(e, '드라이브를 불러오지 못했습니다') });
    }
  }, [toast]);
  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  const load = useCallback(async () => {
    if (view === 'google') return;
    setLoading(true);
    try {
      if (searching) {
        setViewItems(await api<DriveItemView[]>(`/drive/search?q=${encodeURIComponent(q.trim())}`));
        setListing(null);
      } else if (view) {
        setViewItems(await api<DriveItemView[]>(`/drive/view/${view}`));
        setListing(null);
      } else if (spaceId) {
        const qs = new URLSearchParams({ spaceId });
        if (folderId) qs.set('folderId', folderId);
        setListing(await api<Listing>(`/drive/list?${qs.toString()}`));
      }
    } catch (e) {
      toast({ type: 'error', title: errText(e, '불러오지 못했습니다') });
      if (folderId) go({ space: spaceId });
    } finally {
      setLoading(false);
    }
  }, [view, searching, q, spaceId, folderId, toast, go]);
  useEffect(() => {
    void load();
  }, [load]);

  // 구글 연결 뒤 돌아왔을 때 알림
  useEffect(() => {
    const g = params.get('google');
    if (!g) return;
    if (g === 'connected') toast({ type: 'success', title: '구글 드라이브를 연결했습니다' });
    else if (g === 'denied') toast({ type: 'error', title: '구글 연결을 취소했습니다' });
    else toast({ type: 'error', title: params.get('message') ?? '구글 연결에 실패했습니다' });
    go({ view: 'google' });
  }, []);

  const items = view || searching ? viewItems : (listing?.items ?? []);
  const selected = items.filter((i) => sel.has(i.id));
  const hereRole: DriveRole | null = view || searching ? null : (listing?.role ?? null);
  // 새 폴더·올리기를 둘 곳 — 지금 보는 폴더(편집자일 때), 아니면 내 드라이브 맨 위
  const uploadTarget =
    !view && !searching && listing && canEdit(listing.role)
      ? { spaceId: listing.space.id, parentId: folderId }
      : personal
        ? { spaceId: personal.id, parentId: null }
        : null;

  const refreshAll = useCallback(() => {
    void load();
    void loadSpaces();
  }, [load, loadSpaces]);

  // ── 올리기 ──

  const startUploads = useCallback(
    async (files: File[], target: { spaceId: string; parentId: string | null } | null) => {
      if (!target) return;
      const list = files.filter((f) => f.size > 0 || f.type);
      const too = list.filter((f) => f.size > DRIVE_FILE_MAX_BYTES);
      if (too.length)
        toast({
          type: 'error',
          title: `${too.length}개는 ${DRIVE_FILE_MAX_BYTES / 1024 / 1024}MB를 넘어 올리지 않았습니다(큰 파일은 구글 드라이브 링크로)`,
        });
      const ok = list.filter((f) => f.size <= DRIVE_FILE_MAX_BYTES);
      if (!ok.length) return;
      const batch = ok.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        progress: 0,
        status: 'wait' as const,
      }));
      setUploads((u) => [...u.filter((x) => x.status === 'up' || x.status === 'wait'), ...batch]);
      const set = (key: string, patch: Partial<Upload>) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));
      // 3개씩 나란히
      let idx = 0;
      const worker = async () => {
        while (idx < ok.length) {
          const i = idx++;
          const b = batch[i];
          set(b.key, { status: 'up' });
          try {
            await uploadDriveFile(ok[i], target, (p) => set(b.key, { progress: p }));
            set(b.key, { status: 'done', progress: 1 });
          } catch (e) {
            set(b.key, { status: 'error', error: errText(e, '올리지 못했습니다') });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      refreshAll();
    },
    [toast, refreshAll],
  );

  // ── 동작 ──

  const open = (it: DriveItemView) => {
    if (view === 'trash') return;
    if (it.kind === 'FOLDER') go({ space: it.spaceId, folder: it.id });
    else if (it.kind === 'LINK') openLink(it);
    else setPreview(it);
  };

  const run = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast({ type: 'success', title: done });
    } catch (e) {
      toast({ type: 'error', title: errText(e, `${label}하지 못했습니다`) });
    } finally {
      refreshAll();
    }
  };

  const trash = (list: DriveItemView[]) =>
    run(
      '휴지통으로 이동',
      async () => {
        for (const it of list) await api(`/drive/items/${it.id}`, { method: 'DELETE' });
        setSel(new Set());
      },
      `${list.length}개를 휴지통으로 옮겼습니다`,
    );
  const restore = (list: DriveItemView[]) =>
    run(
      '복원',
      async () => {
        let toRoot = 0;
        for (const it of list) {
          const r = await api<{ movedToRoot: boolean }>(`/drive/items/${it.id}/restore`, {
            method: 'POST',
            body: '{}',
          });
          if (r.movedToRoot) toRoot++;
        }
        setSel(new Set());
        if (toRoot)
          toast({
            type: 'info',
            title: `${toRoot}개는 원래 폴더가 없어 드라이브 맨 위로 꺼냈습니다`,
          });
      },
      `${list.length}개를 복원했습니다`,
    );
  const purge = (list: DriveItemView[]) =>
    run(
      '영구 삭제',
      async () => {
        for (const it of list) await api(`/drive/items/${it.id}/permanent`, { method: 'DELETE' });
        setSel(new Set());
      },
      `${list.length}개를 영구 삭제했습니다`,
    );
  const star = (list: DriveItemView[], on: boolean) =>
    run('중요 표시', async () => {
      for (const it of list)
        await api(`/drive/items/${it.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ starred: on }),
        });
    });
  const download = (list: DriveItemView[]) =>
    run('받기', async () => {
      for (const it of list.filter((x) => x.kind === 'FILE')) await downloadDriveFile(it);
    });
  const copy = (it: DriveItemView) =>
    run(
      '사본 만들기',
      () => api(`/drive/items/${it.id}/copy`, { method: 'POST', body: '{}' }),
      '사본을 만들었습니다',
    );
  const toGoogle = (it: DriveItemView) =>
    run('구글 드라이브로 보내기', async () => {
      const r = await api<{ webViewLink: string | null }>(`/drive/items/${it.id}/to-google`, {
        method: 'POST',
        body: '{}',
      });
      toast({ type: 'success', title: '내 구글 드라이브로 보냈습니다' });
      if (r.webViewLink) window.open(r.webViewLink, '_blank', 'noopener,noreferrer');
    });
  const showLocation = (it: DriveItemView) => go({ space: it.spaceId, folder: it.parentId });

  /** 고른 항목(오른쪽 클릭한 항목이 고른 것 밖이면 그것 하나)에 할 수 있는 일 */
  const actionsFor = (list: DriveItemView[]): (MenuEntry & ContextMenuEntry)[] => {
    if (!list.length) return [];
    const one = list.length === 1 ? list[0] : null;
    const editable = list.every((x) => canEdit(x.role));
    if (view === 'trash')
      return [
        { label: '복원', icon: <RotateCcw size={16} />, onClick: () => void restore(list) },
        {
          label: '영구 삭제',
          icon: <XCircle size={16} />,
          danger: true,
          onClick: () => void purge(list),
        },
      ];
    const files = list.filter((x) => x.kind === 'FILE');
    const allStarred = list.every((x) => x.starred);
    const entries: (MenuEntry & ContextMenuEntry)[] = [];
    if (one)
      entries.push({ label: '열기', icon: <ExternalLink size={16} />, onClick: () => open(one) });
    if (files.length)
      entries.push({
        label: '받기',
        icon: <Download size={16} />,
        onClick: () => void download(files),
      });
    if (one && editable)
      entries.push({
        label: '이름 바꾸기',
        icon: <Pencil size={16} />,
        shortcut: 'F2',
        onClick: () => setNaming({ kind: 'rename', item: one }),
      });
    if (one && one.kind !== 'FOLDER' && editable)
      entries.push({
        label: '사본 만들기',
        icon: <Copy size={16} />,
        onClick: () => void copy(one),
      });
    entries.push({ type: 'separator' } as never);
    if (one)
      entries.push({ label: '공유', icon: <Share2 size={16} />, onClick: () => setSharing(one) });
    if (editable)
      entries.push({
        label: '옮기기',
        icon: <FolderInput size={16} />,
        onClick: () => setMoving(list),
      });
    entries.push({
      label: allStarred ? '중요 문서함에서 빼기' : '중요 문서함에 넣기',
      icon: allStarred ? <StarOff size={16} /> : <Star size={16} />,
      onClick: () => void star(list, !allStarred),
    });
    if (one && (view || searching))
      entries.push({
        label: '파일 위치 보기',
        icon: <FolderSearch size={16} />,
        onClick: () => showLocation(one),
      });
    if (one && one.kind === 'FILE')
      entries.push({
        label: '구글 드라이브로 보내기',
        icon: <GoogleMark />,
        onClick: () => void toGoogle(one),
      });
    if (editable) {
      entries.push({ type: 'separator' } as never);
      entries.push({
        label: '휴지통으로',
        icon: <Trash2 size={16} />,
        shortcut: 'Del',
        danger: true,
        onClick: () => void trash(list),
      });
    }
    return entries;
  };

  // ── 고르기 ──

  const click = (e: MouseEvent, it: DriveItemView) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) {
      setSel((s) => {
        const n = new Set(s);
        if (n.has(it.id)) n.delete(it.id);
        else n.add(it.id);
        return n;
      });
      anchor.current = it.id;
    } else if (e.shiftKey && anchor.current) {
      const a = items.findIndex((x) => x.id === anchor.current);
      const b = items.findIndex((x) => x.id === it.id);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSel(new Set(items.slice(from, to + 1).map((x) => x.id)));
    } else {
      setSel(new Set([it.id]));
      anchor.current = it.id;
    }
  };

  // 키보드 — 지우기·이름 바꾸기·모두 고르기·열기·고르기 풀기(입력칸에서는 그대로)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.closest('input, textarea, [contenteditable], [role="dialog"]') ||
        preview ||
        naming ||
        sharing ||
        moving ||
        spaceModal
      )
        return;
      if (e.key === 'Escape') setSel(new Set());
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && view !== 'google') {
        e.preventDefault();
        setSel(new Set(items.map((i) => i.id)));
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selected.length &&
        view !== 'google'
      ) {
        if (view === 'trash') return;
        if (selected.every((x) => canEdit(x.role))) void trash(selected);
      } else if (e.key === 'F2' && selected.length === 1 && canEdit(selected[0].role)) {
        e.preventDefault();
        setNaming({ kind: 'rename', item: selected[0] });
      } else if (e.key === 'Enter' && selected.length === 1) open(selected[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── 끌어다 놓기: 바깥 파일 → 올리기, 목록 항목 → 폴더로 옮기기 ──

  const DRAG_TYPE = 'application/x-tongin-drive';
  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const dragStart = (e: DragEvent, it: DriveItemView) => {
    const ids = sel.has(it.id) ? [...sel] : [it.id];
    if (!sel.has(it.id)) setSel(new Set([it.id]));
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropOnFolder = async (e: DragEvent, folder: { spaceId: string; id: string | null }) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    setDragOver(false);
    if (isFileDrag(e)) {
      void startUploads([...e.dataTransfer.files], {
        spaceId: folder.spaceId,
        parentId: folder.id,
      });
      return;
    }
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    const ids = (JSON.parse(raw) as string[]).filter((id) => id !== folder.id);
    if (!ids.length) return;
    await run(
      '옮기기',
      async () => {
        for (const id of ids)
          await api(`/drive/items/${id}/move`, {
            method: 'POST',
            body: JSON.stringify({ spaceId: folder.spaceId, parentId: folder.id }),
          });
        setSel(new Set());
      },
      `${ids.length}개를 옮겼습니다`,
    );
  };
  const folderDropProps = (
    folder: { spaceId: string; id: string | null },
    key: string,
    enabled: boolean,
  ) =>
    enabled
      ? {
          onDragOver: (e: DragEvent) => {
            if (!isFileDrag(e) && !e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(key);
          },
          onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
          onDrop: (e: DragEvent) => void dropOnFolder(e, folder),
        }
      : {};

  // ── 그리기 ──

  const navItem = (
    key: string,
    label: string,
    icon: React.ReactNode,
    on: boolean,
    onClick: () => void,
    drop?: { spaceId: string; id: string | null; enabled: boolean },
  ) => (
    <button
      key={key}
      type="button"
      className={`${styles.navItem} ${on ? styles.navItemOn : ''} ${dropTarget === key ? styles.navItemDrop : ''}`}
      onClick={onClick}
      {...(drop ? folderDropProps(drop, key, drop.enabled) : {})}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const sharedSpaces = spaces.filter((s) => s.kind === 'SHARED');
  const orgSpaces = spaces.filter((s) => s.kind === 'ORG');
  const quotaSpace = space ?? personal;
  const quotaRatio = quotaSpace ? quotaSpace.usedBytes / quotaSpace.quotaBytes : 0;

  const title = searching ? `'${q}' 검색 결과` : view ? VIEW_TITLE[view] : null;
  const showLoc = !!(view || searching) && view !== 'google';
  const folders = items.filter((i) => i.kind === 'FOLDER');
  const others = items.filter((i) => i.kind !== 'FOLDER');

  const row = (it: DriveItemView) => {
    const { Icon, color } = fileIcon(it);
    const isFolder = it.kind === 'FOLDER';
    const key = `item:${it.id}`;
    const body = (
      <div
        role="option"
        aria-selected={sel.has(it.id)}
        tabIndex={0}
        draggable={view !== 'trash' && canEdit(it.role)}
        onDragStart={(e) => dragStart(e, it)}
        className={`${styles.row} ${showLoc ? styles.wideLoc : ''} ${sel.has(it.id) ? styles.rowSel : ''} ${dropTarget === key ? styles.rowDrop : ''}`}
        onClick={(e) => click(e, it)}
        onDoubleClick={() => open(it)}
        {...folderDropProps(
          { spaceId: it.spaceId, id: it.id },
          key,
          isFolder && canEdit(it.role) && view !== 'trash',
        )}
      >
        <span className={styles.nameCell}>
          <Icon size={20} color={color} fill={isFolder ? color : 'none'} aria-hidden />
          <span className={styles.nameText}>{it.name}</span>
          {it.shared && <Users size={14} className={styles.badgeIcon} aria-label="공유됨" />}
          {it.starred && <Star size={14} className={styles.badgeIcon} aria-label="중요" />}
        </span>
        {showLoc && <span className={styles.cell}>{it.spaceName}</span>}
        <span className={styles.cell}>{it.createdByName ?? '—'}</span>
        <span
          className={styles.cell}
          title={new Date(
            view === 'trash' && it.trashedAt ? it.trashedAt : it.updatedAt,
          ).toLocaleString('ko-KR')}
        >
          {driveDate(view === 'trash' && it.trashedAt ? it.trashedAt : it.updatedAt)}
        </span>
        <span className={styles.cell}>
          {isFolder ? '—' : it.kind === 'LINK' ? '링크' : formatBytes(it.size)}
        </span>
      </div>
    );
    return (
      <ContextMenu
        key={it.id}
        items={actionsFor(sel.has(it.id) ? selected : [it])}
        onOpenChange={(o) => o && !sel.has(it.id) && setSel(new Set([it.id]))}
      >
        {body}
      </ContextMenu>
    );
  };

  const card = (it: DriveItemView) => {
    const { Icon, color } = fileIcon(it);
    const isFolder = it.kind === 'FOLDER';
    const key = `item:${it.id}`;
    return (
      <ContextMenu
        key={it.id}
        items={actionsFor(sel.has(it.id) ? selected : [it])}
        onOpenChange={(o) => o && !sel.has(it.id) && setSel(new Set([it.id]))}
      >
        <div
          role="option"
          aria-selected={sel.has(it.id)}
          tabIndex={0}
          draggable={view !== 'trash' && canEdit(it.role)}
          onDragStart={(e) => dragStart(e, it)}
          className={`${isFolder ? styles.folderCard : styles.fileCard} ${sel.has(it.id) ? styles.cardSel : ''} ${dropTarget === key ? styles.rowDrop : ''}`}
          onClick={(e) => click(e, it)}
          onDoubleClick={() => open(it)}
          {...folderDropProps(
            { spaceId: it.spaceId, id: it.id },
            key,
            isFolder && canEdit(it.role) && view !== 'trash',
          )}
        >
          {isFolder ? (
            <>
              <Icon size={20} color={color} fill={color} aria-hidden />
              <span className={styles.nameText}>{it.name}</span>
            </>
          ) : (
            <>
              <span className={styles.fileCardTop}>
                <Icon size={18} color={color} aria-hidden />
                <span className={styles.nameText}>{it.name}</span>
              </span>
              <span className={styles.thumb}>
                <Thumb item={it} />
              </span>
            </>
          )}
        </div>
      </ContextMenu>
    );
  };

  const newMenu: MenuEntry[] = [
    {
      label: '새 폴더',
      icon: <FolderPlus size={16} />,
      disabled: !uploadTarget,
      onClick: () => setNaming({ kind: 'folder' }),
    },
    { type: 'separator' },
    {
      label: '파일 올리기',
      icon: <Upload size={16} />,
      disabled: !uploadTarget,
      onClick: () => fileInput.current?.click(),
    },
    {
      label: '구글 드라이브에서 가져오기',
      icon: <GoogleMark />,
      onClick: () => go({ view: 'google' }),
    },
    { type: 'separator' },
    {
      label: '새 공유 드라이브',
      icon: <Users size={16} />,
      disabled: !user?.employeeId,
      onClick: () => setSpaceModal({ id: null }),
    },
  ];

  return (
    <div className={styles.drive}>
      <aside className={styles.nav} aria-label="드라이브 탐색">
        <Menu
          items={newMenu}
          placement="bottom-start"
          trigger={
            <button type="button" className={styles.newBtn}>
              <Plus size={22} /> 새로 만들기
            </button>
          }
        />
        {personal &&
          navItem(
            'nav:mine',
            '내 드라이브',
            <HardDrive size={18} />,
            !view && spaceId === personal.id && !searching,
            () => go({ space: personal.id }),
            {
              spaceId: personal.id,
              id: null,
              enabled: true,
            },
          )}
        {navItem('nav:shared', '공유 문서함', <Users size={18} />, view === 'shared', () =>
          go({ view: 'shared' }),
        )}
        {navItem('nav:recent', '최근 문서함', <Clock size={18} />, view === 'recent', () =>
          go({ view: 'recent' }),
        )}
        {navItem('nav:starred', '중요 문서함', <Star size={18} />, view === 'starred', () =>
          go({ view: 'starred' }),
        )}
        {navItem('nav:trash', '휴지통', <Trash2 size={18} />, view === 'trash', () =>
          go({ view: 'trash' }),
        )}

        <div className={styles.navGroup}>
          공유 드라이브
          {user?.employeeId && (
            <button
              type="button"
              className={styles.navGroupBtn}
              title="새 공유 드라이브"
              aria-label="새 공유 드라이브"
              onClick={() => setSpaceModal({ id: null })}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {sharedSpaces.length ? (
          sharedSpaces.map((s) =>
            navItem(
              `space:${s.id}`,
              s.name,
              <Users size={18} />,
              !view && spaceId === s.id && !searching,
              () => go({ space: s.id }),
              {
                spaceId: s.id,
                id: null,
                enabled: canEdit(s.role),
              },
            ),
          )
        ) : (
          <span className={styles.navEmpty}>
            팀·프로젝트별로 함께 쓰는 드라이브를 만들어 보세요
          </span>
        )}
        {orgSpaces.length > 0 && <div className={styles.navGroup}>조직 드라이브</div>}
        {orgSpaces.map((s) =>
          navItem(
            `space:${s.id}`,
            s.name,
            <Building2 size={18} />,
            !view && spaceId === s.id && !searching,
            () => go({ space: s.id }),
            {
              spaceId: s.id,
              id: null,
              enabled: canEdit(s.role),
            },
          ),
        )}
        <div className={styles.navGroup}>연결</div>
        {navItem('nav:google', '구글 드라이브', <GoogleMark />, view === 'google', () =>
          go({ view: 'google' }),
        )}

        {quotaSpace && (
          <div className={styles.quota}>
            <div className={styles.quotaBar}>
              <div
                className={`${styles.quotaFill} ${quotaRatio > 0.9 ? styles.quotaFull : ''}`}
                style={{
                  width: `${Math.min(100, Math.max(quotaRatio * 100, quotaSpace.usedBytes ? 1 : 0))}%`,
                }}
              />
            </div>
            <span>
              {quotaSpace.name}: {formatBytes(quotaSpace.quotaBytes)} 중{' '}
              {formatBytes(quotaSpace.usedBytes)} 사용
            </span>
          </div>
        )}
      </aside>

      <section
        className={styles.main}
        onClick={() => setSel(new Set())}
        onDragOver={(e) => {
          if (!isFileDrag(e) || !uploadTarget || view === 'google' || view === 'trash') return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setDragOver(false);
          void startUploads([...e.dataTransfer.files], uploadTarget);
        }}
      >
        <div className={styles.searchRow}>
          <form
            className={styles.search}
            role="search"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const kw = search.trim();
              if (view === 'google') setParams(kw ? { view: 'google', q: kw } : { view: 'google' });
              else if (kw) go({ q: kw });
              else go({ space: spaceId });
            }}
          >
            <Search size={20} aria-hidden />
            <input
              className="no-focus-ring"
              value={search}
              placeholder={view === 'google' ? '구글 드라이브에서 찾기' : '드라이브에서 찾기'}
              aria-label="드라이브에서 찾기"
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="찾기 지우기"
                onClick={() => {
                  setSearch('');
                  if (q)
                    setParams(
                      view === 'google' ? { view: 'google' } : spaceId ? { space: spaceId } : {},
                    );
                }}
              >
                <X size={18} />
              </button>
            )}
          </form>
        </div>

        {view === 'google' ? (
          <GoogleDrivePanel query={q} onChanged={() => void loadSpaces()} />
        ) : (
          <>
            <div className={styles.head} onClick={(e) => e.stopPropagation()}>
              {selected.length > 0 ? (
                <div className={styles.selBar}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="고르기 풀기"
                    onClick={() => setSel(new Set())}
                  >
                    <X size={18} />
                  </button>
                  <span className={styles.selCount}>{selected.length}개 선택됨</span>
                  {actionsFor(selected)
                    .filter(
                      (
                        a,
                      ): a is MenuEntry & {
                        label: string;
                        icon?: React.ReactNode;
                        onClick?: () => void;
                        danger?: boolean;
                      } => 'label' in a,
                    )
                    .slice(0, 8)
                    .map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        className={styles.iconBtn}
                        title={a.label}
                        aria-label={a.label}
                        onClick={a.onClick}
                      >
                        {a.icon}
                      </button>
                    ))}
                </div>
              ) : (
                <div className={styles.crumbs}>
                  {title ? (
                    <span className={`${styles.crumb} ${styles.crumbLast}`}>{title}</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`${styles.crumb} ${!listing?.path.length ? styles.crumbLast : ''}`}
                        onClick={() => go({ space: spaceId })}
                        {...folderDropProps(
                          { spaceId: spaceId ?? '', id: null },
                          'crumb:root',
                          !!listing && canEdit(listing.role) && !!folderId,
                        )}
                      >
                        {space?.name ?? listing?.space.name ?? '내 드라이브'}
                      </button>
                      {listing?.path.map((p, i) => (
                        <span key={p.id} style={{ display: 'contents' }}>
                          <ChevronRight size={20} className={styles.crumbSep} />
                          <button
                            type="button"
                            className={`${styles.crumb} ${i === listing.path.length - 1 ? styles.crumbLast : ''}`}
                            onClick={() => go({ space: spaceId, folder: p.id })}
                            {...folderDropProps(
                              { spaceId: spaceId ?? '', id: p.id },
                              `crumb:${p.id}`,
                              canEdit(listing.role) && i < listing.path.length - 1,
                            )}
                          >
                            {p.name}
                          </button>
                        </span>
                      ))}
                    </>
                  )}
                </div>
              )}
              {view === 'trash' && items.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void run(
                      '휴지통 비우기',
                      () => api('/drive/trash', { method: 'DELETE' }),
                      '휴지통을 비웠습니다',
                    )
                  }
                >
                  휴지통 비우기
                </Button>
              )}
              {!view && !searching && space && space.kind !== 'PERSONAL' && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  title={space.kind === 'SHARED' ? '구성원 관리' : '드라이브 정보'}
                  aria-label={space.kind === 'SHARED' ? '구성원 관리' : '드라이브 정보'}
                  onClick={() => setSpaceModal({ id: space.id })}
                >
                  {space.kind === 'SHARED' ? <Users size={18} /> : <Info size={18} />}
                </button>
              )}
              <div className={styles.viewToggle} role="group" aria-label="보기">
                {(['list', 'grid'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={layout === l}
                    aria-label={l === 'list' ? '목록 보기' : '바둑판 보기'}
                    onClick={() => {
                      setLayout(l);
                      try {
                        localStorage.setItem(LAYOUT_KEY, l);
                      } catch {
                        /* 기억 못 해도 된다 */
                      }
                    }}
                  >
                    {layout === l && <CheckCircle2 size={14} />}
                    {l === 'list' ? <List size={16} /> : <LayoutGrid size={16} />}
                  </button>
                ))}
              </div>
            </div>

            {view === 'trash' && (
              <p className={styles.hint}>
                휴지통의 항목은 {DRIVE_TRASH_DAYS}일이 지나면 영구 삭제됩니다.
              </p>
            )}

            {loading && !items.length ? (
              <div className={styles.empty}>불러오는 중…</div>
            ) : !items.length ? (
              <EmptyState
                view={searching ? 'search' : view}
                canUpload={canEdit(hereRole)}
                onUpload={() => fileInput.current?.click()}
              />
            ) : layout === 'list' ? (
              <div
                className={styles.list}
                role="listbox"
                aria-multiselectable
                aria-label="파일 목록"
              >
                <div className={`${styles.row} ${styles.rowHead} ${showLoc ? styles.wideLoc : ''}`}>
                  <span>이름</span>
                  {showLoc && <span>위치</span>}
                  <span>만든 사람</span>
                  <span>{view === 'trash' ? '지운 날짜' : '수정한 날짜'}</span>
                  <span>크기</span>
                </div>
                {items.map(row)}
              </div>
            ) : (
              <div role="listbox" aria-multiselectable aria-label="파일 목록">
                {folders.length > 0 && (
                  <>
                    <div className={styles.gridTitle}>폴더</div>
                    <div className={styles.grid}>{folders.map(card)}</div>
                  </>
                )}
                {others.length > 0 && (
                  <>
                    <div className={styles.gridTitle}>파일</div>
                    <div className={styles.grid}>{others.map(card)}</div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {dragOver && (
          <div className={styles.dropOverlay}>
            <span className={styles.dropChip}>
              여기에 놓으면{' '}
              {listing && canEdit(listing.role) && !view && !searching
                ? `'${listing.path.at(-1)?.name ?? listing.space.name}'`
                : '내 드라이브'}
              에 올립니다
            </span>
          </div>
        )}
      </section>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void startUploads(files, uploadTarget);
        }}
      />

      {uploads.length > 0 && (
        <UploadPanel
          uploads={uploads}
          onClose={() =>
            setUploads((u) => u.filter((x) => x.status === 'up' || x.status === 'wait'))
          }
        />
      )}

      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
      {naming && (
        <NameModal
          title={naming.kind === 'folder' ? '새 폴더' : '이름 바꾸기'}
          initial={naming.kind === 'folder' ? '제목 없는 폴더' : naming.item.name}
          confirmLabel={naming.kind === 'folder' ? '만들기' : '확인'}
          onClose={() => setNaming(null)}
          onSubmit={async (name) => {
            try {
              if (naming.kind === 'folder') {
                if (!uploadTarget) return;
                await api('/drive/folders', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...uploadTarget,
                    parentId: uploadTarget.parentId ?? undefined,
                    name,
                  }),
                });
              } else {
                await api(`/drive/items/${naming.item.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ name }),
                });
              }
              setNaming(null);
              refreshAll();
            } catch (e) {
              toast({ type: 'error', title: errText(e, '저장하지 못했습니다') });
            }
          }}
        />
      )}
      {sharing && (
        <ShareModal
          item={sharing}
          myEmployeeId={user?.employeeId ?? null}
          onClose={() => setSharing(null)}
          onSaved={() => {
            setSharing(null);
            refreshAll();
          }}
        />
      )}
      {moving && (
        <MoveModal
          items={moving}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            setSel(new Set());
            refreshAll();
          }}
        />
      )}
      {spaceModal && (
        <SpaceModal
          spaceId={spaceModal.id}
          myEmployeeId={user?.employeeId ?? null}
          onClose={() => setSpaceModal(null)}
          onSaved={(id) => {
            setSpaceModal(null);
            void loadSpaces();
            go({ space: id });
          }}
          onDeleted={() => {
            setSpaceModal(null);
            void loadSpaces();
            go({ space: null });
          }}
        />
      )}
    </div>
  );
}

function EmptyState({
  view,
  canUpload,
  onUpload,
}: {
  view: View | 'search' | null;
  canUpload: boolean;
  onUpload: () => void;
}) {
  const text: Record<string, [string, string]> = {
    search: ['찾은 파일이 없습니다', '다른 낱말로 찾아 보세요.'],
    recent: ['최근에 연 파일이 없습니다', '파일을 열거나 고치면 여기에 모입니다.'],
    starred: [
      '중요 문서함이 비어 있습니다',
      '자주 여는 파일에 중요 표시를 해 두세요(오른쪽 클릭 → 중요 문서함에 넣기).',
    ],
    shared: ['공유받은 파일이 없습니다', '다른 사람이 나에게 공유한 파일·폴더가 여기에 보입니다.'],
    trash: [
      '휴지통이 비어 있습니다',
      `지운 파일은 ${DRIVE_TRASH_DAYS}일 동안 여기 있다가 영구 삭제됩니다.`,
    ],
  };
  const [title, desc] = text[view ?? ''] ?? [
    '비어 있는 폴더입니다',
    '파일을 여기로 끌어다 놓거나 「새로 만들기」로 올리세요.',
  ];
  return (
    <div className={styles.empty}>
      <span className={styles.emptyTitle}>{title}</span>
      <span>{desc}</span>
      {!view && canUpload && (
        <Button variant="outline" onClick={onUpload}>
          <Upload size={16} /> 파일 올리기
        </Button>
      )}
    </div>
  );
}

/** 바둑판 보기의 미리보기 그림(이미지 파일만, 3MB 이하) */
const thumbCache = new Map<string, string>();
function Thumb({ item }: { item: DriveItemView }) {
  const isImage =
    previewKind(item.mimeType, item.name) === 'image' && (item.size ?? 0) <= 3 * 1024 * 1024;
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(item.id) ?? null);
  useEffect(() => {
    if (!isImage || url) return;
    let alive = true;
    fetchDriveFile(item.id)
      .then((b) => {
        const u = URL.createObjectURL(b);
        thumbCache.set(item.id, u);
        if (alive) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isImage, item.id, url]);
  const { Icon, color } = fileIcon(item);
  return url ? (
    <img src={url} alt="" loading="lazy" />
  ) : (
    <Icon size={48} color={color} aria-hidden />
  );
}

function UploadPanel({ uploads, onClose }: { uploads: Upload[]; onClose: () => void }) {
  const running = uploads.filter((u) => u.status === 'up' || u.status === 'wait').length;
  const failed = uploads.filter((u) => u.status === 'error').length;
  return (
    <div className={styles.uploads} role="status" aria-live="polite">
      <div className={styles.uploadsHead}>
        <span>
          {running
            ? `${running}개 올리는 중`
            : failed
              ? `${uploads.length - failed}개 올림 · ${failed}개 실패`
              : `${uploads.length}개 올림`}
        </span>
        {!running && (
          <button type="button" className={styles.iconBtn} aria-label="닫기" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className={styles.uploadsList}>
        {uploads.map((u) => (
          <div key={u.key} className={styles.uploadRow} title={u.error}>
            <span className={styles.uploadName}>{u.name}</span>
            {u.status === 'done' ? (
              <CheckCircle2 size={18} className={styles.uploadDone} aria-label="올림" />
            ) : u.status === 'error' ? (
              <span className={styles.uploadErr}>{u.error}</span>
            ) : (
              <svg
                viewBox="0 0 20 20"
                className={styles.ring}
                aria-label={`${Math.round(u.progress * 100)}%`}
              >
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="var(--ark-color-border)"
                  strokeWidth="3"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="var(--ark-color-primary-500)"
                  strokeWidth="3"
                  strokeDasharray={`${u.progress * 50.3} 50.3`}
                  transform="rotate(-90 10 10)"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
