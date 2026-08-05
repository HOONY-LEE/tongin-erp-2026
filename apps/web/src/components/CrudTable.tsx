import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Button, DataTable, FormModal, PageCard, PageHeader, useToast } from './ui';
import type { Column, FormField, Row } from './ui';

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
}

/** 마스터 목록+등록 화면 공통 구성 (PageHeader + PageCard + DataTable + FormModal). */
export default function CrudTable({
  title,
  path,
  columns,
  fields,
  onDetail,
  hideHeader,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
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

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
      + {t('common.add')}
    </Button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!hideHeader && (
        <PageHeader title={title} actions={addButton} onRefresh={load} updatedAt={updatedAt} />
      )}
      <PageCard title="목록" count={rows.length} actions={hideHeader ? addButton : undefined}>
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
      </PageCard>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={`${title} ${t('common.add')}`}
        fields={fields}
        onSubmit={onSubmit}
      />
    </div>
  );
}
