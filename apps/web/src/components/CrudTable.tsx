import i18n from '../i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import {
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  PageHeader,
  RecordDetail,
  useToast,
} from './ui';
import type { FilterField, FilterValues } from './ui';
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
  /** 서버가 준 목록 중 이 화면에 보일 행만 남긴다(예: 조직관리는 본사 조직만, 지점은 지점관리로) */
  rowFilter?: (row: Row) => boolean;
  /** 상세 화면 아래에 더 그릴 것(예: 조직의 역할·목표·업무분장) */
  detailExtra?: (row: Row) => ReactNode;
  /**
   * 검색 옆 필터 조건 — 주지 않으면 등록 항목 중 고르기(선택지)·예/아니오 칸으로 자동으로 만든다.
   * 빈 배열이면 필터 버튼을 숨긴다.
   */
  filterFields?: FilterField[];
  /** 필터 조건 칸의 값(기본 row[key]) */
  filterGet?: (row: Row, key: string) => unknown;
}

/** 등록 항목에서 필터 조건 만들기 — 선택지가 있는 칸은 여러 개 고르기, 예/아니오 칸은 하나 고르기 */
const autoFilterFields = (fields: FormField[]): FilterField[] =>
  fields.flatMap((f): FilterField[] => {
    if (f.type === 'boolean')
      return [
        {
          key: f.name,
          label: f.label,
          type: 'single',
          options: [
            { value: 'true', label: i18n.t('misc.yes') },
            { value: 'false', label: i18n.t('misc.no') },
          ],
        },
      ];
    const opts = f.options ?? f.optionGroups?.flatMap((g) => g.options);
    if (opts && opts.length > 1 && opts.length <= 20 && !f.optionsBy)
      return [{ key: f.name, label: f.label, type: 'multi', options: opts }];
    return [];
  });

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
  if (f.type === 'boolean')
    return v === true || v === 'true' ? i18n.t('misc.yes') : i18n.t('misc.no');
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
  rowFilter,
  detailExtra,
  filterFields,
  filterGet,
}: Props) {
  const { t } = useTranslation();
  const [flt, setFlt] = useState<FilterValues>({});
  const fFields = filterFields ?? autoFilterFields(fields);
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
      const all = await api<Row[]>(path);
      setRows(rowFilter ? all.filter(rowFilter) : all);
      setUpdatedAt(new Date());
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
    // rowFilter는 렌더마다 새 함수일 수 있어 의존성에서 뺀다 — 같은 화면에선 기준이 바뀌지 않는다
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
      toast({ type: 'success', title: t('misc.updated') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const onDelete = async (row: Row) => {
    const label = String(row.name ?? row.code ?? '');
    if (!window.confirm(t('misc.deleteQ', { v0: label }))) return;
    try {
      await api(`${path}/${String(row.id)}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('misc.deleted') });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('misc.deleteFailed') });
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
      title={t('misc.editOf', { v0: title })}
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
          title={row ? String(row.name ?? row.code ?? title) : t('misc.notFound')}
          backLabel={title}
          onBack={detail.close}
          actions={
            row ? (
              <>
                {rowActions?.(row, load)}
                {deletable && (
                  <Button variant="outline" size="sm" onClick={() => void onDelete(row)}>
                    {t('misc.delete')}
                  </Button>
                )}
                {editable && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(row)}>
                    {t('misc.edit')}
                  </Button>
                )}
              </>
            ) : undefined
          }
          sections={[{ items }]}
        >
          {row && detailExtra?.(row)}
        </RecordDetail>
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
        filters={
          fFields.length ? (
            <FilterButton fields={fFields} value={flt} onChange={setFlt} />
          ) : undefined
        }
        columns={columns}
        rows={filterRows(rows, fFields, flt, (r, key) =>
          filterGet
            ? filterGet(r, key)
            : r[key] === null || r[key] === undefined
              ? ''
              : String(r[key]),
        )}
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
