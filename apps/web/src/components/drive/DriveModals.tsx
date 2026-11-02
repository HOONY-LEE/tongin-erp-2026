import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Download, Folder, HardDrive, Users, X } from 'lucide-react';
import {
  DRIVE_ROLE,
  type DriveItemView,
  type DriveRole,
  type DriveShareView,
  type DriveSpaceKind,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { useDirectory } from '../../lib/approvals';
import { downloadDriveFile, fetchDriveFile, fileIcon, previewKind } from '../../lib/drive';
import { Combobox } from '@sunghoon_lee/akron-ui';
import { Button, Input, Modal, Select, useToast } from '../ui';
import styles from './drive.module.css';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

// ── 이름 정하기(새 폴더·이름 바꾸기·새 공유 드라이브 이름) ──

export function NameModal({
  title,
  initial,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => {
          // 파일 이름은 확장자 앞까지만 골라 둔다(구글 드라이브처럼)
          const dot = e.target.value.lastIndexOf('.');
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
        }}
      />
    </Modal>
  );
}

// ── 미리보기 ──

export function PreviewModal({ item, onClose }: { item: DriveItemView; onClose: () => void }) {
  const toast = useToast();
  const kind = previewKind(item.mimeType, item.name);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { Icon, color } = fileIcon(item);

  useEffect(() => {
    if (!kind) return;
    let alive = true;
    let made: string | null = null;
    fetchDriveFile(item.id)
      .then(async (blob) => {
        if (!alive) return;
        if (kind === 'text') setText((await blob.text()).slice(0, 500_000));
        else {
          // PDF는 브라우저가 종류를 알아야 창 안에서 연다
          made = URL.createObjectURL(
            kind === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob,
          );
          setUrl(made);
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [item.id, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () =>
    downloadDriveFile(item).catch((e) =>
      toast({ type: 'error', title: errText(e, '받지 못했습니다') }),
    );

  // 사이드바·머리글 위로 — body에 바로 붙인다
  return createPortal(
    <div className={styles.preview} role="dialog" aria-modal aria-label={item.name}>
      <div className={styles.previewHead}>
        <button type="button" className={styles.iconBtn} aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
        <Icon size={20} color={color} aria-hidden />
        <span className={styles.previewName}>{item.name}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="받기"
          title="받기"
          onClick={download}
        >
          <Download size={20} />
        </button>
      </div>
      <div
        className={styles.previewBody}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {!kind || failed ? (
          <div className={styles.previewNone}>
            <Icon size={48} color={color} aria-hidden />
            <span>{failed ? '파일을 열지 못했습니다' : '미리 볼 수 없는 파일입니다'}</span>
            <Button variant="primary" onClick={download}>
              받기
            </Button>
          </div>
        ) : kind === 'text' ? (
          <pre className={styles.previewText}>{text ?? '불러오는 중…'}</pre>
        ) : !url ? (
          <span>불러오는 중…</span>
        ) : kind === 'image' ? (
          <img src={url} alt={item.name} />
        ) : kind === 'pdf' ? (
          <iframe src={url} title={item.name} />
        ) : kind === 'video' ? (
          <video src={url} controls autoFocus />
        ) : (
          <audio src={url} controls autoFocus />
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── 사람 고르기 + 권한 ──

interface Picked {
  employeeId: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
  role: DriveRole;
}

function PeopleEditor({
  value,
  onChange,
  roles,
  lockedId,
}: {
  value: Picked[];
  onChange: (v: Picked[]) => void;
  roles: DriveRole[];
  /** 고칠 수 없는 사람(나) */
  lockedId?: string | null;
}) {
  const { people } = useDirectory();
  const options = useMemo(
    () =>
      people
        .filter((p) => !value.some((v) => v.employeeId === p.id))
        .map((p) => ({
          value: p.id,
          label: p.name,
          description: [p.positionName, p.orgUnitName].filter(Boolean).join(' · '),
        })),
    [people, value],
  );
  return (
    <>
      <Combobox
        options={options}
        value={null}
        placeholder="사람 추가"
        searchPlaceholder="이름으로 찾기"
        onChange={(id) => {
          const p = people.find((x) => x.id === id);
          if (p)
            onChange([
              ...value,
              {
                employeeId: p.id,
                name: p.name,
                positionName: p.positionName,
                orgUnitName: p.orgUnitName,
                role: roles.includes('EDITOR') ? 'EDITOR' : roles[0],
              },
            ]);
        }}
      />
      <div className={styles.people}>
        {value.map((p) => (
          <div key={p.employeeId} className={styles.person}>
            <span className={styles.avatar}>{p.name.slice(0, 1)}</span>
            <span className={styles.personText}>
              <span>{p.name}</span>
              <span className={styles.personSub}>
                {[p.positionName, p.orgUnitName].filter(Boolean).join(' · ')}
              </span>
            </span>
            {p.employeeId === lockedId ? (
              <span className={styles.muted}>{DRIVE_ROLE[p.role]}(나)</span>
            ) : (
              <>
                <div className={styles.roleSelect}>
                  <Select
                    value={p.role}
                    onValueChange={(r) =>
                      onChange(
                        value.map((x) =>
                          x.employeeId === p.employeeId ? { ...x, role: r as DriveRole } : x,
                        ),
                      )
                    }
                    options={roles.map((r) => ({ value: r, label: DRIVE_ROLE[r] }))}
                    aria-label={`${p.name} 권한`}
                  />
                </div>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`${p.name} 빼기`}
                  onClick={() => onChange(value.filter((x) => x.employeeId !== p.employeeId))}
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── 공유 ──

export function ShareModal({
  item,
  myEmployeeId,
  onClose,
  onSaved,
}: {
  item: DriveItemView;
  myEmployeeId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [list, setList] = useState<Picked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = item.role !== 'VIEWER';

  useEffect(() => {
    api<DriveShareView[]>(`/drive/items/${item.id}/shares`)
      .then((r) => setList(r))
      .catch((e) => {
        toast({ type: 'error', title: errText(e, '불러오지 못했습니다') });
        onClose();
      });
  }, [item.id, toast, onClose]);

  const save = async () => {
    if (!list) return;
    setBusy(true);
    try {
      await api(`/drive/items/${item.id}/shares`, {
        method: 'PUT',
        body: JSON.stringify({
          shares: list
            .filter((p) => p.employeeId !== myEmployeeId)
            .map((p) => ({ employeeId: p.employeeId, role: p.role })),
        }),
      });
      toast({ type: 'success', title: '공유했습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: errText(e, '공유하지 못했습니다') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`'${item.name}' 공유`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? '취소' : '닫기'}
          </Button>
          {canEdit && (
            <Button variant="primary" loading={busy} disabled={!list} onClick={() => void save()}>
              저장
            </Button>
          )}
        </>
      }
    >
      <div className={styles.form}>
        <p className={styles.muted}>
          {item.kind === 'FOLDER' ? '폴더를 공유하면 그 안의 파일·폴더도 함께 보입니다. ' : ''}
          {item.spaceKind === 'PERSONAL'
            ? '내 드라이브 파일은 공유한 사람만 볼 수 있습니다.'
            : `'${item.spaceName}' 드라이브 구성원은 이미 볼 수 있습니다. 여기서는 그 밖의 사람에게 더 줍니다.`}
        </p>
        {list === null ? (
          <span className={styles.muted}>불러오는 중…</span>
        ) : canEdit ? (
          <PeopleEditor value={list} onChange={setList} roles={['VIEWER', 'EDITOR']} />
        ) : (
          <div className={styles.people}>
            {list.map((p) => (
              <div key={p.employeeId} className={styles.person}>
                <span className={styles.avatar}>{p.name.slice(0, 1)}</span>
                <span className={styles.personText}>{p.name}</span>
                <span className={styles.muted}>{DRIVE_ROLE[p.role]}</span>
              </div>
            ))}
            {!list.length && <span className={styles.muted}>공유한 사람이 없습니다.</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── 공유 드라이브 만들기·관리 ──

interface SpaceDetail {
  id: string;
  kind: DriveSpaceKind;
  name: string;
  description: string | null;
  role: DriveRole;
  members: Picked[];
}

export function SpaceModal({
  spaceId,
  myEmployeeId,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** 없으면 새로 만들기 */
  spaceId: string | null;
  myEmployeeId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !spaceId;
  const canEdit = isNew || detail?.role === 'MANAGER';
  const isShared = isNew || detail?.kind === 'SHARED';

  useEffect(() => {
    if (!spaceId) return;
    api<SpaceDetail>(`/drive/spaces/${spaceId}`)
      .then((d) => {
        setDetail(d);
        setName(d.name);
        setMembers(d.members);
      })
      .catch((e) => {
        toast({ type: 'error', title: errText(e, '불러오지 못했습니다') });
        onClose();
      });
  }, [spaceId, toast, onClose]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        members: members.map((m) => ({ employeeId: m.employeeId, role: m.role })),
      };
      if (isNew) {
        const r = await api<{ id: string }>('/drive/spaces', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toast({ type: 'success', title: '공유 드라이브를 만들었습니다' });
        onSaved(r.id);
      } else {
        await api(`/drive/spaces/${spaceId}`, {
          method: 'PATCH',
          body: JSON.stringify(isShared ? body : { members: body.members }),
        });
        toast({ type: 'success', title: '저장했습니다' });
        onSaved(spaceId);
      }
    } catch (e) {
      toast({ type: 'error', title: errText(e, '저장하지 못했습니다') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!spaceId) return;
    setBusy(true);
    try {
      await api(`/drive/spaces/${spaceId}`, { method: 'DELETE' });
      toast({ type: 'success', title: '공유 드라이브를 지웠습니다' });
      onDeleted?.();
    } catch (e) {
      toast({ type: 'error', title: errText(e, '지우지 못했습니다') });
    } finally {
      setBusy(false);
    }
  };

  const managers = members.filter((m) => m.role === 'MANAGER').length;
  const ready = !!name.trim() && (!isShared || isNew || managers > 0);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? '새 공유 드라이브' : (detail?.name ?? '드라이브')}
      footer={
        <>
          {!isNew && canEdit && isShared && (
            <Button
              variant={confirmDelete ? 'danger' : 'ghost'}
              style={{ marginRight: 'auto' }}
              loading={busy && confirmDelete}
              onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
            >
              {confirmDelete ? '안의 파일까지 모두 지우기' : '드라이브 지우기'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? '취소' : '닫기'}
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              loading={busy && !confirmDelete}
              disabled={!ready}
              onClick={() => void save()}
            >
              {isNew ? '만들기' : '저장'}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.form}>
        {isShared && (
          <label className={styles.field}>
            이름
            <Input
              autoFocus={isNew}
              value={name}
              disabled={!canEdit}
              maxLength={200}
              placeholder="예: 가을 이사 캠페인"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <div className={styles.field}>
          {isShared ? '구성원' : '따로 둔 관리자·구성원'}
          <p className={styles.muted} style={{ margin: 0, fontWeight: 400 }}>
            {isShared
              ? '관리자: 구성원·이름 관리 · 편집자: 올리기·고치기·지우기 · 뷰어: 보기·받기. 만든 사람은 관리자가 됩니다.'
              : '조직 드라이브는 이 조직과 하위 조직 사람이 모두 편집자입니다. 그 밖의 사람이나 관리자를 따로 둘 때만 넣으세요.'}
          </p>
          {canEdit ? (
            <PeopleEditor
              value={members}
              onChange={setMembers}
              roles={['MANAGER', 'EDITOR', 'VIEWER']}
              lockedId={isNew ? myEmployeeId : null}
            />
          ) : (
            <div className={styles.people}>
              {members.map((p) => (
                <div key={p.employeeId} className={styles.person}>
                  <span className={styles.avatar}>{p.name.slice(0, 1)}</span>
                  <span className={styles.personText}>{p.name}</span>
                  <span className={styles.muted}>{DRIVE_ROLE[p.role]}</span>
                </div>
              ))}
            </div>
          )}
          {isShared && !isNew && canEdit && managers === 0 && (
            <span className={styles.muted}>관리자를 한 명 이상 두어야 합니다.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── 옮기기 ──

interface Tree {
  spaces: { id: string; name: string; kind: DriveSpaceKind }[];
  folders: { id: string; spaceId: string; parentId: string | null; name: string }[];
}

/** 폴더 고르기 — 옮기기·구글에서 가져오기에 쓴다(내가 편집자인 드라이브만) */
export function FolderPickerModal({
  title,
  confirmLabel,
  blockedIds = [],
  initialSpaceIds = [],
  onClose,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  /** 고를 수 없는 폴더(옮기는 폴더 자신) — 그 안도 펼치지 않는다 */
  blockedIds?: string[];
  initialSpaceIds?: string[];
  onClose: () => void;
  onConfirm: (target: { spaceId: string; parentId: string | null }) => Promise<void>;
}) {
  const toast = useToast();
  const [tree, setTree] = useState<Tree | null>(null);
  const [target, setTarget] = useState<{ spaceId: string; parentId: string | null } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const moving = new Set(blockedIds);
  const initialKey = initialSpaceIds.join(',');

  useEffect(() => {
    api<Tree>('/drive/folders')
      .then((t) => {
        setTree(t);
        // 지금 있는 드라이브를 펼쳐 둔다
        setOpen(new Set(initialKey ? initialKey.split(',') : []));
      })
      .catch((e) => toast({ type: 'error', title: errText(e, '불러오지 못했습니다') }));
  }, [initialKey, toast]);

  const children = (spaceId: string, parentId: string | null) =>
    (tree?.folders ?? []).filter((f) => f.spaceId === spaceId && f.parentId === parentId);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderFolders = (spaceId: string, parentId: string | null, depth: number) =>
    children(spaceId, parentId).map((f) => {
      const kids = children(spaceId, f.id);
      const isOn = target?.spaceId === spaceId && target.parentId === f.id;
      // 옮기는 폴더 자신·그 안으로는 못 옮긴다
      const blocked = moving.has(f.id);
      return (
        <div key={f.id}>
          <button
            type="button"
            className={`${styles.treeRow} ${isOn ? styles.treeRowOn : ''}`}
            style={{ paddingLeft: 8 + depth * 18 }}
            disabled={blocked}
            onClick={() => setTarget({ spaceId, parentId: f.id })}
            onDoubleClick={() => kids.length && toggle(f.id)}
          >
            <ChevronRight
              size={14}
              style={{
                visibility: kids.length ? 'visible' : 'hidden',
                transform: open.has(f.id) ? 'rotate(90deg)' : undefined,
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggle(f.id);
              }}
            />
            <Folder size={16} aria-hidden />
            {f.name}
          </button>
          {!blocked && open.has(f.id) && renderFolders(spaceId, f.id, depth + 1)}
        </div>
      );
    });

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await onConfirm(target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!target}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.tree}>
        {!tree ? (
          <span className={styles.muted}>불러오는 중…</span>
        ) : (
          tree.spaces.map((s) => {
            const isOn = target?.spaceId === s.id && target.parentId === null;
            return (
              <div key={s.id}>
                <button
                  type="button"
                  className={`${styles.treeRow} ${styles.treeSpace} ${isOn ? styles.treeRowOn : ''}`}
                  onClick={() => {
                    setTarget({ spaceId: s.id, parentId: null });
                    if (!open.has(s.id)) toggle(s.id);
                  }}
                >
                  <ChevronRight
                    size={14}
                    style={{ transform: open.has(s.id) ? 'rotate(90deg)' : undefined }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(s.id);
                    }}
                  />
                  {s.kind === 'PERSONAL' ? (
                    <HardDrive size={16} aria-hidden />
                  ) : (
                    <Users size={16} aria-hidden />
                  )}
                  {s.name}
                </button>
                {open.has(s.id) && renderFolders(s.id, null, 1)}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

/** 옮기기 — 다른 드라이브로도 */
export function MoveModal({
  items,
  onClose,
  onMoved,
}: {
  items: DriveItemView[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const toast = useToast();
  return (
    <FolderPickerModal
      title={items.length === 1 ? `'${items[0].name}' 옮기기` : `${items.length}개 옮기기`}
      confirmLabel="여기로 옮기기"
      blockedIds={items.map((i) => i.id)}
      initialSpaceIds={[...new Set(items.map((i) => i.spaceId))]}
      onClose={onClose}
      onConfirm={async (target) => {
        try {
          for (const it of items) {
            await api(`/drive/items/${it.id}/move`, {
              method: 'POST',
              body: JSON.stringify(target),
            });
          }
          toast({ type: 'success', title: `${items.length}개를 옮겼습니다` });
          onMoved();
        } catch (e) {
          toast({ type: 'error', title: errText(e, '옮기지 못했습니다') });
        }
      }}
    />
  );
}

/** 링크(구글 드라이브) 항목 열기 — 새 탭 */
export function openLink(item: DriveItemView) {
  if (!item.url) return;
  window.open(item.url, '_blank', 'noopener,noreferrer');
  void api(`/drive/items/${item.id}/opened`, { method: 'POST', body: '{}' }).catch(() => undefined);
}
