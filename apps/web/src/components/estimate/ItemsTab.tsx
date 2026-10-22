import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  summarizeVolume,
  VOLUME_UNIT_LABEL,
  type MoveItemDef,
  type VolumeUnit,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Button, Checkbox, SegmentedControl, Select, useToast } from '../ui';
import { SaveBar, UnitField } from './parts';
import { useTabForm } from './useTabForm';
import { toNum, type EstimateDetailData, type EstimateLine, type TabProps } from './types';
import styles from './estimate.module.css';

interface ItemRow {
  uid: string;
  cbmItemId: string | null;
  itemName: string;
  itemNameEng: string;
  /** 이 견적에 넣은 물품인가 — 켜면 물품의 기본 부피·무게가 채워진다 */
  on: boolean;
  cbm: string;
  ton: string;
  handling: string;
  memo: string;
  /** 방 틀에서 온 물품이면 이름을 고정하고 삭제 대신 끈다 */
  preset: boolean;
}
interface RoomForm {
  uid: string;
  roomKey: string | null;
  name: string;
  nameEng: string;
  rows: ItemRow[];
}
interface ItemsForm {
  unit: VolumeUnit;
  rooms: RoomForm[];
}

const numText = (v: string | number | null | undefined) =>
  v == null || !Number(v) ? '' : String(Number(v));

/**
 * 서버 견적 → 화면 틀. 방 틀(상품관리 › 방)을 깔고, 저장된 물품을 같은 물품(없으면 같은 이름)에 맞춰 켠다.
 * 물품은 방에 속한 게 아니라 사전의 물품 하나를 가리킨다 — 방 틀은 자주 쓰는 물품을 펼쳐 둘 뿐.
 */
const derive = (d: EstimateDetailData): ItemsForm => {
  const { rooms: roomDefs, items } = d.moveCatalog;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const firstHandling = d.moveCatalog.handlings[0]?.code ?? 'CARRY';
  const used = new Set<string>();
  const fromLine = (l: EstimateLine, preset: boolean): ItemRow => {
    used.add(l.id);
    return {
      uid: `l:${l.id}`,
      cbmItemId: l.cbmItemId,
      itemName: l.itemName,
      itemNameEng: l.itemNameEng ?? '',
      on: true,
      cbm: numText(l.cbm),
      ton: numText(l.ton),
      handling: l.handling,
      memo: l.memo ?? '',
      preset,
    };
  };

  const rooms: RoomForm[] = roomDefs.map((room) => {
    const zone = d.zones.find((z) => z.roomKey === room.code);
    const saved = zone ? d.lines.filter((l) => l.zoneId === zone.id) : [];
    const rows: ItemRow[] = room.itemIds
      .map((id) => itemById.get(id))
      .filter((it): it is MoveItemDef => !!it)
      .map((it) => {
        const hit = saved.find(
          (l) => !used.has(l.id) && (l.cbmItemId === it.id || l.itemName === it.name),
        );
        if (hit) return { ...fromLine(hit, true), uid: `${room.code}:${it.id}` };
        return {
          uid: `${room.code}:${it.id}`,
          cbmItemId: it.id,
          itemName: it.name,
          itemNameEng: it.nameEng ?? '',
          on: false,
          cbm: '',
          ton: '',
          handling: firstHandling,
          memo: '',
          preset: true,
        };
      });
    // 방 틀에 없는 물품(직접 추가한 것)은 그 방 끝에
    for (const l of saved) if (!used.has(l.id)) rows.push(fromLine(l, false));
    return {
      uid: room.code,
      roomKey: room.code,
      name: room.name,
      nameEng: room.nameEng ?? '',
      rows,
    };
  });

  // 견적에서 직접 만든 방(또는 지금은 '사용 안 함'인 방 틀)
  const known = new Set(roomDefs.map((r) => r.code));
  for (const z of [...d.zones].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (z.roomKey && known.has(z.roomKey)) continue;
    rooms.push({
      uid: `z:${z.id}`,
      roomKey: null,
      name: z.name,
      nameEng: '',
      rows: d.lines.filter((l) => l.zoneId === z.id).map((l) => fromLine(l, false)),
    });
  }
  const loose = d.lines.filter((l) => !used.has(l.id));
  if (loose.length) {
    rooms.push({
      uid: 'loose',
      roomKey: null,
      name: '미분류',
      nameEng: '',
      rows: loose.map((l) => fromLine(l, false)),
    });
  }
  return { unit: d.volumeUnit ?? 'CBM', rooms };
};

let seq = 0;
const newUid = (p: string) => `${p}:new${++seq}`;

/** 2. 물품정보 — 방마다 물품을 고르고 부피(또는 무게)·처리방법·메모를 적는다. */
export function ItemsTab({ data, canEdit, onSaved, onDirtyChange }: TabProps) {
  const toast = useToast();
  const { form, setForm, dirty, reset, accept } = useTabForm(data, derive, onDirtyChange);
  const [saving, setSaving] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const catalog = data.moveCatalog;
  const itemByName = useMemo(() => new Map(catalog.items.map((i) => [i.name, i])), [catalog]);
  const itemById = useMemo(() => new Map(catalog.items.map((i) => [i.id, i])), [catalog]);
  const buckets = useMemo(
    () => Object.fromEntries(catalog.handlings.map((h) => [h.code, h.bucket])),
    [catalog],
  );
  const handlingOptions = catalog.handlings.map((h) => ({
    value: h.code,
    label: h.isActive ? h.name : `${h.name} (사용 안 함)`,
  }));
  const unit = form.unit;
  const unitText = VOLUME_UNIT_LABEL[unit];
  const valueKey = unit === 'TON' ? 'ton' : 'cbm';

  // 펼침 상태는 입력값이 아니라서 따로 둔다(저장 안 됨 판정에 섞이지 않게)
  const [open, setOpen] = useState<Set<string>>(() => {
    const init = derive(data).rooms;
    const withValues = init.filter((r) => r.rows.some((x) => x.on)).map((r) => r.uid);
    return new Set(withValues.length ? withValues : [init[0]?.uid]);
  });

  const onRows = (rows: ItemRow[]) => rows.filter((r) => r.on);
  const total = useMemo(
    () => summarizeVolume(onRows(form.rooms.flatMap((r) => r.rows)), { buckets, unit }),
    [form, buckets, unit],
  );

  const toggle = (uid: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  const setRooms = (fn: (rooms: RoomForm[]) => RoomForm[]) =>
    setForm((f) => ({ ...f, rooms: fn(f.rooms) }));
  const patchRow = (roomUid: string, rowUid: string, patch: Partial<ItemRow>) =>
    setRooms((rooms) =>
      rooms.map((r) =>
        r.uid !== roomUid
          ? r
          : { ...r, rows: r.rows.map((row) => (row.uid === rowUid ? { ...row, ...patch } : row)) },
      ),
    );

  /** 켜면 비어 있는 값을 물품의 기본 부피·무게로 채운다(기본값을 안 쓰려면 지우면 된다) */
  const switchRow = (roomUid: string, row: ItemRow, on: boolean) => {
    const def = row.cbmItemId ? itemById.get(row.cbmItemId) : undefined;
    patchRow(roomUid, row.uid, {
      on,
      ...(on && def ? { cbm: row.cbm || numText(def.cbm), ton: row.ton || numText(def.ton) } : {}),
    });
  };

  /** 직접 추가한 물품의 이름 — 사전에 있는 이름이면 그 물품으로 연결하고 기본값을 채운다 */
  const renameRow = (roomUid: string, row: ItemRow, name: string) => {
    const def = itemByName.get(name.trim());
    patchRow(roomUid, row.uid, {
      itemName: name,
      cbmItemId: def?.id ?? null,
      itemNameEng: def?.nameEng ?? '',
      ...(def ? { cbm: row.cbm || numText(def.cbm), ton: row.ton || numText(def.ton) } : {}),
    });
  };

  const addRow = (roomUid: string) =>
    setRooms((rooms) =>
      rooms.map((r) =>
        r.uid !== roomUid
          ? r
          : {
              ...r,
              rows: [
                ...r.rows,
                {
                  uid: newUid(roomUid),
                  cbmItemId: null,
                  itemName: '',
                  itemNameEng: '',
                  on: true,
                  cbm: '',
                  ton: '',
                  handling: catalog.handlings[0]?.code ?? 'CARRY',
                  memo: '',
                  preset: false,
                },
              ],
            },
      ),
    );
  const removeRow = (roomUid: string, rowUid: string) =>
    setRooms((rooms) =>
      rooms.map((r) =>
        r.uid !== roomUid ? r : { ...r, rows: r.rows.filter((x) => x.uid !== rowUid) },
      ),
    );
  const addRoom = () => {
    const name = newRoomName.trim();
    if (!name) return;
    const uid = newUid('room');
    setRooms((rooms) => [...rooms, { uid, roomKey: null, name, nameEng: '', rows: [] }]);
    setOpen((s) => new Set(s).add(uid));
    setNewRoomName('');
  };
  const removeRoom = (roomUid: string) =>
    setRooms((rooms) => rooms.filter((r) => r.uid !== roomUid));

  const save = async () => {
    const unnamed = form.rooms.some((r) => r.rows.some((row) => row.on && !row.itemName.trim()));
    if (unnamed) {
      toast({ type: 'warning', title: '직접 추가한 물품의 이름을 입력하세요.' });
      return;
    }
    setSaving(true);
    try {
      const n = (v: string) => (v === '' ? undefined : toNum(v));
      const next = await api<EstimateDetailData>(`/estimates/${data.id}/items`, {
        method: 'PUT',
        body: JSON.stringify({
          volumeUnit: unit,
          rooms: form.rooms.map((r, i) => ({
            roomKey: r.roomKey ?? undefined,
            name: r.name,
            sortOrder: i,
            lines: onRows(r.rows).map((row) => ({
              cbmItemId: row.cbmItemId ?? undefined,
              itemName: row.itemName.trim(),
              itemNameEng: row.itemNameEng || undefined,
              cbm: n(row.cbm),
              ton: n(row.ton),
              handling: row.handling,
              memo: row.memo.trim() || undefined,
            })),
          })),
        }),
      });
      accept(next);
      onSaved(next);
      toast({ type: 'success', title: '물품정보를 저장했습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 직접 입력한 물품 이름에서 사전 물품을 고를 수 있게 */}
      <datalist id={`move-items-${data.id}`}>
        {catalog.items.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle} style={{ marginBottom: 0 }}>
            합계 <span className={styles.sub}>/Total Amount</span>
          </h3>
          <SegmentedControl
            value={unit}
            onChange={(v) => setForm((f) => ({ ...f, unit: v as VolumeUnit }))}
            options={[
              { value: 'CBM', label: 'CBM 견적' },
              { value: 'TON', label: '톤 견적' },
            ]}
            size="sm"
            disabled={!canEdit}
          />
        </div>
        <div className={styles.volGrid}>
          {(
            [
              ['이사물량', total.moving],
              ['경유물량', total.transit],
              ['폐기물량', total.discard],
              ['전체물량', total.total],
            ] as const
          ).map(([label, v], i) => (
            <div key={label} className={[styles.volCard, i === 3 ? styles.volTotal : ''].join(' ')}>
              <div className={styles.infoLabel}>{label}</div>
              <div className={styles.volValue}>
                {v} <span className={styles.unit}>{unitText}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {form.rooms.map((room, ri) => {
        const isOpen = open.has(room.uid);
        const roomTotal = summarizeVolume(onRows(room.rows), { buckets, unit }).total;
        const count = onRows(room.rows).length;
        return (
          <section key={room.uid} className={styles.room}>
            <button
              type="button"
              className={styles.roomHead}
              onClick={() => toggle(room.uid)}
              aria-expanded={isOpen}
            >
              <span className={styles.roomNo}>{ri + 1}</span>
              <span style={{ minWidth: 0 }}>
                <div className={styles.roomName}>{room.name}</div>
                {room.nameEng && <div className={styles.roomEng}>/{room.nameEng}</div>}
              </span>
              <span className={[styles.cbmPill, count ? styles.cbmPillOn : ''].join(' ')}>
                {count ? `${count}개 · ` : ''}
                {roomTotal} {unitText}
              </span>
              {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isOpen && (
              <>
                <div className={[styles.itemGrid, styles.itemHeadRow].join(' ')}>
                  <span>물품</span>
                  <span>메모</span>
                  <span style={{ textAlign: 'right' }}>
                    {unit === 'TON' ? '무게(톤)' : '부피(CBM)'}
                  </span>
                  <span>처리방법</span>
                  <span />
                </div>
                {room.rows.map((row) => {
                  const def = row.cbmItemId ? itemById.get(row.cbmItemId) : undefined;
                  const fallback = numText(unit === 'TON' ? def?.ton : def?.cbm);
                  return (
                    <div
                      key={row.uid}
                      className={[
                        styles.itemGrid,
                        styles.itemRow,
                        row.on ? styles.itemRowFilled : styles.itemRowOff,
                      ].join(' ')}
                    >
                      {row.preset ? (
                        <Checkbox
                          checked={row.on}
                          onCheckedChange={(v) => switchRow(room.uid, row, v === true)}
                          label={row.itemName}
                          description={row.itemNameEng || undefined}
                          disabled={!canEdit}
                        />
                      ) : (
                        <input
                          className={styles.textInput}
                          value={row.itemName}
                          list={`move-items-${data.id}`}
                          placeholder="물품명 (목록에서 고르거나 직접 입력)"
                          aria-label="물품명"
                          disabled={!canEdit}
                          onChange={(e) => renameRow(room.uid, row, e.target.value)}
                        />
                      )}
                      <input
                        className={styles.textInput}
                        value={row.memo}
                        placeholder="메모"
                        aria-label={`${row.itemName || '물품'} 메모`}
                        disabled={!canEdit || !row.on}
                        onChange={(e) => patchRow(room.uid, row.uid, { memo: e.target.value })}
                      />
                      <UnitField
                        value={row[valueKey]}
                        unit={unitText}
                        ariaLabel={`${row.itemName || '물품'} ${unit === 'TON' ? '무게' : '부피'}`}
                        placeholder={fallback || '0'}
                        disabled={!canEdit || !row.on}
                        onChange={(v) => patchRow(room.uid, row.uid, { [valueKey]: v })}
                      />
                      <Select
                        value={row.handling}
                        onValueChange={(v) => patchRow(room.uid, row.uid, { handling: v })}
                        options={handlingOptions}
                        disabled={!canEdit || !row.on}
                      />
                      {row.preset ? (
                        <span />
                      ) : (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="물품 삭제"
                          disabled={!canEdit}
                          onClick={() => removeRow(room.uid, row.uid)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {canEdit && (
                  <div className={styles.roomFoot}>
                    <Button variant="outline" size="sm" onClick={() => addRow(room.uid)}>
                      <Plus size={14} /> 물품 추가
                    </Button>
                    {!room.roomKey && (
                      <Button variant="ghost" size="sm" onClick={() => removeRoom(room.uid)}>
                        방 삭제
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}

      {canEdit && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.textInput}
            style={{ flex: 1, maxWidth: 320 }}
            value={newRoomName}
            placeholder="방 이름 (예: 드레스룸, 서재)"
            aria-label="추가할 방 이름"
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRoom()}
          />
          <Button variant="outline" onClick={addRoom} disabled={!newRoomName.trim()}>
            <Plus size={14} /> 방 추가
          </Button>
        </div>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving}
        canEdit={canEdit}
        onSave={save}
        onReset={reset}
        hint="체크한 물품만 저장됩니다. 체크하면 물품의 기본 부피·무게가 채워지고, 고쳐 쓸 수 있습니다."
      />
    </div>
  );
}
