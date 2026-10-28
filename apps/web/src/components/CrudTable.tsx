import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Button, DataTable, FormModal, PageHeader, RecordDetail, useToast } from './ui';
import type { DetailItem } from './ui';
import { useDetailParam } from '../lib/useDetailParam';
import type { Column, FormField, Row } from './ui';
import { ADDRESS_PARTS, addrKey } from './ui/address';

// 기존 import 경로 유지를 위한 재노출
export type { Column, FormField, Row } from './ui';

interface Props {
  title: string;
  path: string;
  columns: Column[];
  fields: FormField[];
  /** 행을 누르면 갈 전용 상세 화면(예: 상품구성 → /products/:id). 없으면 공통 상세(?detail=id)가 열린다 */
  onDetail?: (row: Row) => void;
  /** 탭 컨테이너(PartnerMgmt 등) 안에 중첩될 때 상위 PageHeader와 중복되지 않도록 자체 PageHeader를 생략 */
  hideHeader?: boolean;
  /** 상세 화면에 수정(PATCH path/:id) 버튼 — 등록 폼과 같은 필드를 쓴다 */
  editable?: boolean;
  /** 상세 화면에 삭제(DELETE path/:id) 버튼 — 확인창 후 삭제. 쓰는 곳이 있으면 서버가 409로 막는다 */
  deletable?: boolean;
  /** 상세 화면에 더 붙일 버튼(예: 방의 물품 구성). reload로 목록을 다시 읽는다 */
  rowActions?: (row: Row, reload: () => Promise<void>) => ReactNode;
  /** 머리글 오른쪽에 둘 버튼(예: 설정) */
  headerActions?: ReactNode;
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

/** 상세 화면에 보일 값 — 선택지는 이름으로, 예/아니오, 주소는 한 줄로 */
const fieldValue = (row: Row, f: FormField): DetailItem['value'] => {
  if (f.type === 'address') {
    const p = f.addrPrefix ?? '';
    return [row[addrKey(p, 'addr')], row[addrKey(p, 'addrDetail')]].filter(Boolean).join(' ');
  }
  const v = row[f.name];
  if (v === null || v === undefined || v === '') return null;
  if (f.type === 'boolean') return v === true || v === 'true' ? '예' : '아니오';
  if (f.options) return f.options.find((o) => o.value === String(v))?.label ?? String(v);
  return String(v);
};

/**
 * 마스터 목록+등록 화면 공통 구성 (PageHeader + DataTable + FormModal).
 * 행을 누르면 상세(?detail=id)로 들어가고, 수정·삭제 같은 동작은 상세 화면 머리글에 있다.
 */
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
  headerActions,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const detail = useDetailParam();

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
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
      + {t('common.add')}
    </Button>
  );

  const editModal = editable && (
    <FormModal
      open={!!editing}
      onOpenChange={(o) => !o && setEditing(null)}
      title={`${title} 수정`}
      fields={fields}
      initialValues={editing ? toInitial(editing, fields) : undefined}
      onSubmit={onEdit}
    />
  );

  if (detail.id) {
    const row = rows.find((r) => String(r.id) === detail.id);
    // 등록 항목 전부 + 등록 항목에 없는 목록 칸(들어 있는 방·건수처럼 서버가 계산한 값)
    const fieldNames = new Set(
      fields.flatMap((f) =>
        f.type === 'address'
          ? ADDRESS_PARTS.map((part) => addrKey(f.addrPrefix ?? '', part))
          : [f.name],
      ),
    );
    const items: DetailItem[] = row
      ? [
          ...fields.map((f) => ({
            label: f.label,
            value: fieldValue(row, f),
            wide: f.type === 'address',
          })),
          ...columns
            .filter(
              (c) => c.dataIndex && !fieldNames.has(c.dataIndex) && typeof c.title === 'string',
            )
            .map((c) => ({
              label: c.title as string,
              value: c.render ? c.render(row) : (row[c.dataIndex!] as string),
            })),
        ]
      : [];
    return (
      <>
        <RecordDetail
          loading={!row && (loading || !updatedAt)}
          title={row ? String(row.name ?? row.code ?? title) : '찾을 수 없습니다'}
          backLabel={title}
          onBack={detail.close}
          actions={
            row ? (
              <>
                {rowActions?.(row, load)}
                {deletable && (
                  <Button variant="outline" size="sm" onClick={() => void onDelete(row)}>
                    삭제
                  </Button>
                )}
                {editable && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(row)}>
                    수정
                  </Button>
                )}
              </>
            ) : undefined
          }
          sections={[{ items }]}
        />
        {editModal}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!hideHeader && (
        <PageHeader title={title} onRefresh={load} updatedAt={updatedAt} actions={headerActions} />
      )}
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => (onDetail ? onDetail(r) : detail.open(String(r.id)))}
        toolbarActions={addButton}
      />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={`${title} ${t('common.add')}`}
        fields={fields}
        onSubmit={onSubmit}
      />
      {editModal}
    </div>
  );
}
