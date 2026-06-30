import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Button, DataTable, FormModal, PageCard, useToast } from './ui';
import type { Column, FormField, Row } from './ui';

// 기존 import 경로 유지를 위한 재노출
export type { Column, FormField, Row } from './ui';

interface Props {
  title: string;
  path: string;
  columns: Column[];
  fields: FormField[];
  onDetail?: (row: Row) => void;
}

/** 마스터 목록+등록 화면 공통 구성 (PageCard + DataTable + FormModal). */
export default function CrudTable({ title, path, columns, fields, onDetail }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>(path));
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

  return (
    <PageCard
      title={title}
      count={rows.length}
      actions={
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + {t('common.add')}
        </Button>
      }
    >
      <DataTable
        columns={
          onDetail
            ? [
                ...columns,
                {
                  title: '',
                  render: (r: Row) => (
                    <Button variant="ghost" size="sm" onClick={() => onDetail(r)}>
                      상세 →
                    </Button>
                  ),
                },
              ]
            : columns
        }
        rows={rows}
        loading={loading}
      />
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={`${title} ${t('common.add')}`}
        fields={fields}
        onSubmit={onSubmit}
      />
    </PageCard>
  );
}
