import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { HANDLING, HANDLING_LABEL, ROOM_PRESETS, summarizeVolume } from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Button, Select, useToast } from '../ui';
import { SaveBar, UnitField } from './parts';
import { useTabForm } from './useTabForm';
import { toNum, type EstimateDetailData, type TabProps } from './types';
import styles from './estimate.module.css';

const HANDLING_OPTIONS = HANDLING.map((h) => ({ value: h, label: HANDLING_LABEL[h] }));

interface ItemRow {
  uid: string;
  itemName: string;
  itemNameEng: string;
  cbm: string;
  handling: string;
  memo: string;
  /** 기본 틀에서 온 물품이면 이름을 고정하고 삭제 대신 비워 둔다 */
  preset: boolean;
}
interface RoomForm {
  uid: string;
  roomKey: string | null;
  name: string;
  nameEng: string;
  rows: ItemRow[];
}

const cbmText = (v: string | number) => (Number(v) ? String(Number(v)) : '');

/** 서버 견적 → 화면 틀. 기본 방·물품을 깔고 저장된 값을 이름으로 맞춰 채운다. */
const derive = (d: EstimateDetailData): RoomForm[] => {
  const used = new Set<string>();
  const toRow = (l: EstimateDetailData['lines'][number], preset: boolean): ItemRow => {
    used.add(l.id);
    return {
      uid: `l:${l.id}`,
      itemName: l.itemName,
      itemNameEng: l.itemNameEng ?? '',
      cbm: cbmText(l.cbm),
      handling: l.handling,
      memo: l.memo ?? '',
      preset,
    };
  };

  const rooms: RoomForm[] = ROOM_PRESETS.map((preset) => {
    const zone = d.zones.find((z) => z.roomKey === preset.key);
    const saved = zone ? d.lines.filter((l) => l.zoneId === zone.id) : [];
    const rows: ItemRow[] = preset.items.map((item, i) => {
      const hit = saved.find((l) => !used.has(l.id) && l.itemName === item.name);
      if (hit) return { ...toRow(hit, true), uid: `${preset.key}:${i}`, itemNameEng: item.nameEng };
      return {
        uid: `${preset.key}:${i}`,
        itemName: item.name,
        itemNameEng: item.nameEng,
        cbm: '',
        handling: 'CARRY',
        memo: '',
        preset: true,
      };
    });
    // 기본 틀에 없는 물품(직접 추가한 것)은 그 방 끝에
    for (const l of saved) if (!used.has(l.id)) rows.push(toRow(l, false));
    return {
      uid: preset.key,
      roomKey: preset.key,
      name: preset.name,
      nameEng: preset.nameEng,
      rows,
    };
  });

  // 직접 만든 방(또는 예전 데이터의 구역)
  const presetKeys = new Set(ROOM_PRESETS.map((r) => r.key));
  const custom = d.zones
    .filter((z) => !z.roomKey || !presetKeys.has(z.roomKey))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const z of custom) {
    rooms.push({
      uid: `z:${z.id}`,
      roomKey: null,
      name: z.name,
      nameEng: '',
      rows: d.lines.filter((l) => l.zoneId === z.id).map((l) => toRow(l, false)),
    });
  }
  // 어느 방에도 속하지 않은 물품
  const loose = d.lines.filter((l) => !used.has(l.id));
  if (loose.length) {
    rooms.push({
      uid: 'loose',
      roomKey: null,
      name: '미분류',
      nameEng: '',
      rows: loose.map((l) => toRow(l, false)),
    });
  }
  return rooms;
};

const filled = (r: ItemRow) => toNum(r.cbm) > 0 || r.memo.trim() !== '';
const asLines = (rows: ItemRow[]) => rows.map((r) => ({ cbm: toNum(r.cbm), handling: r.handling }));
let seq = 0;
const newUid = (p: string) => `${p}:new${++seq}`;

/** 2. 물품정보 — 방마다 물품의 부피·처리방법·메모를 적는다. */
export function ItemsTab({ data, canEdit, onSaved, onDirtyChange }: TabProps) {
  const toast = useToast();
  const { form, setForm, dirty, reset, accept } = useTabForm(data, derive, onDirtyChange);
  const [saving, setSaving] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  // 펼침 상태는 입력값이 아니라서 따로 둔다(저장 안 됨 판정에 섞이지 않게)
  const [open, setOpen] = useState<Set<string>>(() => {
    const init = derive(data);
    const withValues = init.filter((r) => r.rows.some(filled)).map((r) => r.uid);
    return new Set(withValues.length ? withValues : [init[0]?.uid]);
  });

  const total = useMemo(() => summarizeVolume(asLines(form.flatMap((r) => r.rows))), [form]);

  const toggle = (uid: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  const patchRow = (roomUid: string, rowUid: string, patch: Partial<ItemRow>) =>
    setForm((rooms) =>
      rooms.map((r) =>
        r.uid !== roomUid
          ? r
          : { ...r, rows: r.rows.map((row) => (row.uid === rowUid ? { ...row, ...patch } : row)) },
      ),
    );
  const addRow = (roomUid: string) =>
    setForm((rooms) =>
      rooms.map((r) =>
        r.uid !== roomUid
          ? r
          : {
              ...r,
              rows: [
                ...r.rows,
                {
                  uid: newUid(roomUid),
                  itemName: '',
                  itemNameEng: '',
                  cbm: '',
                  handling: 'CARRY',
                  memo: '',
                  preset: false,
                },
              ],
            },
      ),
    );
  const removeRow = (roomUid: string, rowUid: string) =>
    setForm((rooms) =>
      rooms.map((r) =>
        r.uid !== roomUid ? r : { ...r, rows: r.rows.filter((x) => x.uid !== rowUid) },
      ),
    );
  const addRoom = () => {
    const name = newRoomName.trim();
    if (!name) return;
    const uid = newUid('room');
    setForm((rooms) => [...rooms, { uid, roomKey: null, name, nameEng: '', rows: [] }]);
    setOpen((s) => new Set(s).add(uid));
    setNewRoomName('');
  };
  const removeRoom = (roomUid: string) =>
    setForm((rooms) => rooms.filter((r) => r.uid !== roomUid));

  const save = async () => {
    const unnamed = form.some((r) => r.rows.some((row) => filled(row) && !row.itemName.trim()));
    if (unnamed) {
      toast({ type: 'warning', title: '직접 추가한 물품의 이름을 입력하세요.' });
      return;
    }
    setSaving(true);
    try {
      const next = await api<EstimateDetailData>(`/estimates/${data.id}/items`, {
        method: 'PUT',
        body: JSON.stringify({
          rooms: form.map((r, i) => ({
            roomKey: r.roomKey ?? undefined,
            name: r.name,
            sortOrder: i,
            lines: r.rows.filter(filled).map((row) => ({
              itemName: row.itemName.trim(),
              itemNameEng: row.itemNameEng || undefined,
              cbm: toNum(row.cbm),
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
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>
          합계 <span className={styles.sub}>/Total Amount</span>
        </h3>
        <div className={styles.volGrid}>
          {(
            [
              ['운반물량', total.moving, ''],
              ['경유물량', total.transit, ''],
              ['폐기물량', total.discard, '폐기 + 하역'],
              ['전체물량', total.total, '방치·업체 제외'],
            ] as const
          ).map(([label, v, note], i) => (
            <div key={label} className={[styles.volCard, i === 3 ? styles.volTotal : ''].join(' ')}>
              <div className={styles.infoLabel}>
                {label}
                {note && <span style={{ marginLeft: 6, fontSize: 11 }}>({note})</span>}
              </div>
              <div className={styles.volValue}>
                {v} <span className={styles.unit}>CBM</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {form.map((room, ri) => {
        const isOpen = open.has(room.uid);
        const roomTotal = summarizeVolume(asLines(room.rows)).total;
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
              <span className={[styles.cbmPill, roomTotal ? styles.cbmPillOn : ''].join(' ')}>
                {roomTotal} CBM
              </span>
              {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isOpen && (
              <>
                <div className={[styles.itemGrid, styles.itemHeadRow].join(' ')}>
                  <span>물품</span>
                  <span>메모</span>
                  <span style={{ textAlign: 'right' }}>부피(CBM)</span>
                  <span>처리방법</span>
                  <span />
                </div>
                {room.rows.map((row) => (
                  <div
                    key={row.uid}
                    className={[
                      styles.itemGrid,
                      styles.itemRow,
                      filled(row) ? styles.itemRowFilled : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {row.preset ? (
                      <span className={styles.itemName}>
                        {row.itemName}
                        {row.itemNameEng && (
                          <span className={styles.itemEng}>{row.itemNameEng}</span>
                        )}
                      </span>
                    ) : (
                      <input
                        className={styles.textInput}
                        value={row.itemName}
                        placeholder="물품명"
                        aria-label="물품명"
                        disabled={!canEdit}
                        onChange={(e) => patchRow(room.uid, row.uid, { itemName: e.target.value })}
                      />
                    )}
                    <input
                      className={styles.textInput}
                      value={row.memo}
                      placeholder="메모"
                      aria-label={`${row.itemName || '물품'} 메모`}
                      disabled={!canEdit}
                      onChange={(e) => patchRow(room.uid, row.uid, { memo: e.target.value })}
                    />
                    <UnitField
                      value={row.cbm}
                      unit="CBM"
                      ariaLabel={`${row.itemName || '물품'} 부피`}
                      disabled={!canEdit}
                      onChange={(v) => patchRow(room.uid, row.uid, { cbm: v })}
                    />
                    <Select
                      value={row.handling}
                      onValueChange={(v) => patchRow(room.uid, row.uid, { handling: v })}
                      options={HANDLING_OPTIONS}
                      disabled={!canEdit}
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
                ))}
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
        hint="부피나 메모를 적은 물품만 저장됩니다."
      />
    </div>
  );
}
