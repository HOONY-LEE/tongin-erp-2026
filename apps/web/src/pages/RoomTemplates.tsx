import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, Checkbox, Input, Modal, useToast } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';

interface ItemRow {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
}

const columns: Column[] = [
  {
    title: '방',
    dataIndex: 'name',
    minWidth: 140,
    render: (r: Row) => (
      <span>
        {String(r.name)}
        {r.nameEng ? (
          <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ark-color-text-secondary)' }}>
            {String(r.nameEng)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    title: '자주 들어가는 물품',
    flex: 1,
    minWidth: 220,
    render: (r: Row) => {
      const names = (r.itemNames as string[]) ?? [];
      return names.length
        ? `${names.slice(0, 6).join(', ')}${names.length > 6 ? ` 외 ${names.length - 6}개` : ''}`
        : '-';
    },
  },
  {
    title: '상태',
    render: (r: Row) => (
      <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
        {r.isActive ? '사용' : '사용 안 함'}
      </Badge>
    ),
  },
];

const fields: FormField[] = [
  { name: 'name', label: '방 이름', required: true, placeholder: '예: 드레스룸' },
  { name: 'nameEng', label: '영문명(견적서 병기)', placeholder: 'DRESS ROOM', alwaysShow: true },
  { name: 'sortOrder', label: '표시 순서(작을수록 위)', type: 'number' },
  { name: 'isActive', label: '사용 여부', type: 'boolean' },
];

/**
 * 방의 물품 구성 — 견적 물품정보에서 이 방을 펼치면 미리 나올 물품과 순서.
 * 물품은 이사물품 사전의 것을 가리킬 뿐이라, 여러 방에 같은 물품을 넣어도 같은 물품이다.
 */
function RoomItemsModal({
  room,
  onClose,
  onSaved,
}: {
  room: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!room) return;
    setPicked((room.itemIds as string[]) ?? []);
    setQ('');
    api<ItemRow[]>('/cbm-items')
      .then(setItems)
      .catch(() => setItems([]));
  }, [room]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const filtered = items.filter(
    (i) => i.isActive && (!q.trim() || i.name.includes(q.trim()) || i.category.includes(q.trim())),
  );
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const move = (idx: number, d: -1 | 1) =>
    setPicked((p) => {
      const n = [...p];
      const j = idx + d;
      if (j < 0 || j >= n.length) return p;
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });

  const save = async () => {
    if (!room) return;
    setSaving(true);
    try {
      await api(`/room-templates/${String(room.id)}/items`, {
        method: 'PUT',
        body: JSON.stringify({ itemIds: picked }),
      });
      toast({ type: 'success', title: '방의 물품 구성을 저장했습니다' });
      onSaved();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!room}
      onOpenChange={(o) => !o && onClose()}
      title={`${String(room?.name ?? '')} — 물품 구성`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            저장
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="물품·분류 검색" />
          <div
            style={{
              maxHeight: 380,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {filtered.map((i) => (
              <Checkbox
                key={i.id}
                checked={picked.includes(i.id)}
                onCheckedChange={(v) => toggle(i.id, v === true)}
                label={i.name}
                description={i.category}
              />
            ))}
            {!filtered.length && (
              <div style={{ fontSize: 13, color: 'var(--ark-color-text-secondary)' }}>
                맞는 물품이 없습니다. 이사물품 탭에서 먼저 등록하세요.
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            이 방에 펼쳐 둘 물품 {picked.length}개 (위에서부터 순서대로)
          </div>
          <div
            style={{
              maxHeight: 400,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {picked.map((id, idx) => (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'var(--ark-color-bg-muted)',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {byId.get(id)?.name ?? '(삭제된 물품)'}
                </span>
                <Button variant="ghost" size="sm" aria-label="위로" onClick={() => move(idx, -1)}>
                  <ArrowUp size={14} />
                </Button>
                <Button variant="ghost" size="sm" aria-label="아래로" onClick={() => move(idx, 1)}>
                  <ArrowDown size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="빼기"
                  onClick={() => toggle(id, false)}
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** 방 — 견적 물품정보에 기본으로 펼쳐 둘 방과, 방마다 자주 들어가는 물품 */
export default function RoomTemplates() {
  const [editing, setEditing] = useState<{ row: Row; reload: () => Promise<void> } | null>(null);
  return (
    <>
      <CrudTable
        title="방"
        path="/room-templates"
        columns={columns}
        fields={fields}
        editable
        deletable
        hideHeader
        extraActionWidth={84}
        rowActions={(row, reload) => (
          <Button variant="ghost" size="sm" onClick={() => setEditing({ row, reload })}>
            물품 구성
          </Button>
        )}
      />
      <RoomItemsModal
        room={editing?.row ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => void editing?.reload()}
      />
    </>
  );
}
