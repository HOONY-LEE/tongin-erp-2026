import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Button, DataTable, FormModal, PageHeader, useToast } from './ui';
import type { Column, FormField, Row } from './ui';
import { ADDRESS_PARTS, addrKey } from './ui/address';

// 기존 import 경로 유지를 위한 재노출
export type { Column, FormField, Row } from './ui';

interface Props {
  title: string;
  path: string;
  columns: Column[];
  fields: FormField[];
  onDetail?: (row: Row) => void;
  /** 탭 컨테이너(PartnerMgmt 등) 안에 중첩될 때 상위 PageHeader와 중복되지 않도록 자체 PageHeader를 생략 */
  hideHeader?: boolean;
  /** 행마다 수정(PATCH path/:id) 버튼 — 등록 폼과 같은 필드를 쓴다 */
  editable?: boolean;
  /** 행마다 삭제(DELETE path/:id) 버튼 — 확인창 후 삭제. 쓰는 곳이 있으면 서버가 409로 막는다 */
  deletable?: boolean;
  /** 행마다 더 붙일 버튼(예: 방의 물품 구성). reload로 목록을 다시 읽는다 */
  rowActions?: (row: Row, reload: () => Promise<void>) => ReactNode;
  /** 버튼 칸 폭을 더 잡아야 할 때(rowActions 버튼 폭) */
  extraActionWidth?: number;
}

/** 행 값을 폼 초기값(문자열)으로 — 주소 칸은 우편번호·주소·좌표 등 여러 키로 나뉜다 */
const toInitial = (row: Row, fields: FormField[]) => {
  const keys = fields.flatMap((f) =>
    f.type === 'address' ? ADDRESS_PARTS.map((p) => addrKey(f.addrPrefix ?? '', p)) : [f.name],
  );
  return Object.fromEntries(
    keys.filter((k) => row[k] !== null && row[k] !== undefined).map((k) => [k, String(row[k])]),
  );
};

/** 마스터 목록+등록 화면 공통 구성 (PageHeader + PageCard + DataTable + FormModal). */
export default function CrudTable({
  title,
  path,
  columns,
  fields,
  onDetail,
  hideHeader,
  editable,
  deletable,
  rowActions,
  extraActionWidth = 0,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>(path));
      setUpdatedAt(new Date());
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [path, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(values) });
      toast({ type: 'success', title: t('common.created') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onEdit = async (values: Record<string, unknown>) => {
    if (!editing) return;
    try {
      await api(`${path}/${String(editing.id)}`, { method: 'PATCH', body: JSON.stringify(values) });
      toast({ type: 'success', title: '수정했습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onDelete = async (row: Row) => {
    const label = String(row.name ?? row.code ?? '');
    if (!window.confirm(`'${label}'을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`${path}/${String(row.id)}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const hasActions = !!onDetail || editable || deletable || !!rowActions;
  // 버튼이 잘리지 않게 개수만큼 폭을 잡는다(상세 → 는 조금 더 넓다)
  const actionWidth =
    (editable ? 60 : 0) + (deletable ? 60 : 0) + (onDetail ? 80 : 0) + extraActionWidth + 48;
  const actionColumn: Column = {
    title: '',
    width: actionWidth,
    render: (r: Row) => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {rowActions?.(r, load)}
        {editable && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
            수정
          </Button>
        )}
        {deletable && (
          <Button variant="ghost" size="sm" onClick={() => void onDelete(r)}>
            삭제
          </Button>
        )}
        {onDetail && (
          <Button variant="ghost" size="sm" onClick={() => onDetail(r)}>
            상세 →
          </Button>
        )}
      </div>
    ),
  };

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
      + {t('common.add')}
    </Button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!hideHeader && <PageHeader title={title} onRefresh={load} updatedAt={updatedAt} />}
      <DataTable
        columns={hasActions ? [...columns, actionColumn] : columns}
        rows={rows}
        loading={loading}
        toolbarActions={addButton}
      />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={`${title} ${t('common.add')}`}
        fields={fields}
        onSubmit={onSubmit}
      />
      {editable && (
        <FormModal
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          title={`${title} 수정`}
          fields={fields}
          initialValues={editing ? toInitial(editing, fields) : undefined}
          onSubmit={onEdit}
        />
      )}
    </div>
  );
}
