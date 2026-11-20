import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { EmployeeAvatar } from '../employee/EmployeeAvatar';
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
  const { t } = useTranslation();
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
            {t('drive.cancel')}
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
  const { t } = useTranslation();
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
      toast({ type: 'error', title: errText(e, t('drive.downloadFailed')) }),
    );

  // 사이드바·머리글 위로 — body에 바로 붙인다
  return createPortal(
    <div className={styles.preview} role="dialog" aria-modal aria-label={item.name}>
      <div className={styles.previewHead}>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('drive.close')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <Icon size={20} color={color} aria-hidden />
        <span className={styles.previewName}>{item.name}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('drive.download')}
          title={t('drive.download')}
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
            <span>{failed ? t('drive.openFailed') : t('drive.noPreview')}</span>
            <Button variant="primary" onClick={download}>
              {t('drive.download')}
            </Button>
          </div>
        ) : kind === 'text' ? (
          <pre className={styles.previewText}>{text ?? t('drive.loading')}</pre>
        ) : !url ? (
          <span>{t('drive.loading')}</span>
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
  const { t } = useTranslation();
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
        placeholder={t('drive.addPerson')}
        searchPlaceholder={t('drive.findByName')}
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
            <EmployeeAvatar id={p.employeeId} name={p.name} size={32} />
            <span className={styles.personText}>
              <span>{p.name}</span>
              <span className={styles.personSub}>
                {[p.positionName, p.orgUnitName].filter(Boolean).join(' · ')}
              </span>
            </span>
            {p.employeeId === lockedId ? (
              <span className={styles.muted}>
                {DRIVE_ROLE[p.role]}
                {t('drive.me')}
              </span>
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
                    aria-label={t('drive.roleOf', { v0: p.name })}
                  />
                </div>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('drive.removeOf', { v0: p.name })}
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
  const { t } = useTranslation();
  const toast = useToast();
  const [list, setList] = useState<Picked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = item.role !== 'VIEWER';

  useEffect(() => {
    api<DriveShareView[]>(`/drive/items/${item.id}/shares`)
      .then((r) => setList(r))
      .catch((e) => {
        toast({ type: 'error', title: errText(e, t('drive.loadFailed')) });
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
      toast({ type: 'success', title: t('drive.sharedOk') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('drive.shareFailed')) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('drive.shareTitle', { v0: item.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? t('drive.cancel') : t('drive.close')}
          </Button>
          {canEdit && (
            <Button variant="primary" loading={busy} disabled={!list} onClick={() => void save()}>
              {t('drive.save')}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.form}>
        <p className={styles.muted}>
          {item.kind === 'FOLDER' ? t('drive.shareFolderNote') : ''}
          {item.spaceKind === 'PERSONAL'
            ? t('drive.shareMyNote')
            : t('drive.shareSpaceNote', { v0: item.spaceName })}
        </p>
        {list === null ? (
          <span className={styles.muted}>{t('drive.loading')}</span>
        ) : canEdit ? (
          <PeopleEditor value={list} onChange={setList} roles={['VIEWER', 'EDITOR']} />
        ) : (
          <div className={styles.people}>
            {list.map((p) => (
              <div key={p.employeeId} className={styles.person}>
                <EmployeeAvatar id={p.employeeId} name={p.name} size={32} />
                <span className={styles.personText}>{p.name}</span>
                <span className={styles.muted}>{DRIVE_ROLE[p.role]}</span>
              </div>
            ))}
            {!list.length && <span className={styles.muted}>{t('drive.noShares')}</span>}
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
  const { t } = useTranslation();
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
        toast({ type: 'error', title: errText(e, t('drive.loadFailed')) });
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
        toast({ type: 'success', title: t('drive.spaceCreated') });
        onSaved(r.id);
      } else {
        await api(`/drive/spaces/${spaceId}`, {
          method: 'PATCH',
          body: JSON.stringify(isShared ? body : { members: body.members }),
        });
        toast({ type: 'success', title: t('drive.saved') });
        onSaved(spaceId);
      }
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('drive.saveFailed')) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!spaceId) return;
    setBusy(true);
    try {
      await api(`/drive/spaces/${spaceId}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('drive.spaceDeleted') });
      onDeleted?.();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('drive.deleteFailed')) });
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
      title={isNew ? t('drive.newShared') : (detail?.name ?? t('drive.drive'))}
      footer={
        <>
          {!isNew && canEdit && isShared && (
            <Button
              variant={confirmDelete ? 'danger' : 'ghost'}
              style={{ marginRight: 'auto' }}
              loading={busy && confirmDelete}
              onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
            >
              {confirmDelete ? t('drive.deleteAll') : t('drive.deleteDrive')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? t('drive.cancel') : t('drive.close')}
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              loading={busy && !confirmDelete}
              disabled={!ready}
              onClick={() => void save()}
            >
              {isNew ? t('drive.create') : t('drive.save')}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.form}>
        {isShared && (
          <label className={styles.field}>
            {t('drive.col.name')}
            <Input
              autoFocus={isNew}
              value={name}
              disabled={!canEdit}
              maxLength={200}
              placeholder={t('drive.namePh')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <div className={styles.field}>
          {isShared ? t('drive.membersLabel') : t('drive.extraMembers')}
          <p className={styles.muted} style={{ margin: 0, fontWeight: 400 }}>
            {isShared ? t('drive.rolesHelp') : t('drive.orgRolesHelp')}
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
                  <EmployeeAvatar id={p.employeeId} name={p.name} size={32} />
                  <span className={styles.personText}>{p.name}</span>
                  <span className={styles.muted}>{DRIVE_ROLE[p.role]}</span>
                </div>
              ))}
            </div>
          )}
          {isShared && !isNew && canEdit && managers === 0 && (
            <span className={styles.muted}>{t('drive.needAdmin')}</span>
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
  const { t } = useTranslation();
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
      .catch((e) => toast({ type: 'error', title: errText(e, t('drive.loadFailed')) }));
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
            {t('drive.cancel')}
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
          <span className={styles.muted}>{t('drive.loading')}</span>
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
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <FolderPickerModal
      title={
        items.length === 1
          ? t('drive.moveOne', { v0: items[0].name })
          : t('drive.moveN', { v0: items.length })
      }
      confirmLabel={t('drive.moveHere')}
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
          toast({ type: 'success', title: t('drive.moved', { v0: items.length }) });
          onMoved();
        } catch (e) {
          toast({ type: 'error', title: errText(e, t('drive.moveFailed')) });
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
