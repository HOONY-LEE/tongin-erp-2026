import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Phone as PhoneCell } from 'softium-ui/table';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { reloadExtensions, useExtensions, type Extension } from '../lib/extensions';
import {
  Button,
  ConfirmModal,
  DataTable,
  FormModal,
  ListPage,
  useToast,
  type Column,
  type Row,
} from '../components/ui';

/**
 * 내선 관리 — 상담원이 통화를 돌려줄 사무실 직원·부서 번호.
 * 여기 등록하면 상담 콘솔 '내선' 목록과 통화 막대 [돌려주기]에 바로 나온다.
 * 고치기는 내선 관리 권한(CS_CALL.EXTENSIONS)이 있는 관리자.
 */
export default function Extensions() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  // 내선 등록·수정은 내선 관리 권한(관리자 — 경영관리 등)
  const editable = can('CS_CALL.EXTENSIONS');
  const rows = useExtensions();
  const [editing, setEditing] = useState<Extension | 'new' | null>(null);
  const [del, setDel] = useState<Extension | null>(null);

  const columns: Column[] = [
    { title: t('prod.name'), dataIndex: 'label', width: 140 },
    {
      title: t('prod.dept'),
      dataIndex: 'dept',
      render: (r) => (r.dept as string | null) ?? '-',
      width: 120,
    },
    {
      title: t('prod.ext'),
      dataIndex: 'extNo',
      render: (r) => (r.extNo as string | null) ?? '-',
      width: 100,
    },
    {
      title: t('prod.transferTo'),
      dataIndex: 'number',
      render: (r) => <PhoneCell value={r.number as string} link={false} />,
      width: 150,
    },
    { title: t('prod.memo'), dataIndex: 'memo', flex: 1, minWidth: 140 },
    ...(editable
      ? [
          {
            title: '',
            width: 56,
            mask: false,
            render: (r: Row) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('prod.deleteOf', { v0: r.label as string })}
                onClick={(e) => {
                  e.stopPropagation();
                  setDel(r as unknown as Extension);
                }}
              >
                <Trash2 size={14} />
              </Button>
            ),
          } as Column,
        ]
      : []),
  ];

  const save = async (v: Record<string, unknown>) => {
    try {
      await api('/cs-transfer-targets', {
        method: 'POST',
        body: JSON.stringify({
          ...(editing && editing !== 'new' ? { id: editing.id } : {}),
          label: String(v.label ?? ''),
          dept: String(v.dept ?? ''),
          extNo: String(v.extNo ?? ''),
          number: String(v.number ?? ''),
          memo: String(v.memo ?? ''),
        }),
      });
      await reloadExtensions();
      toast({ type: 'success', title: t('prod.extSaved') });
      setEditing(null);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('prod.saveFailed') });
      throw e;
    }
  };
  const remove = async (x: Extension) => {
    try {
      await api(`/cs-transfer-targets/${x.id}`, { method: 'DELETE' });
      await reloadExtensions();
      toast({ type: 'success', title: t('prod.extDeleted') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('prod.deleteFailed') });
    }
  };

  return (
    <ListPage
      fit
      title={t('prod.extTitle')}
      subtitle={t('prod.extSub')}
      actions={
        editable ? (
          <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
            {t('prod.extCreate')}
          </Button>
        ) : undefined
      }
    >
      <DataTable
        fit
        pageSize={20}
        columns={columns}
        rows={rows as unknown as Row[]}
        onRowClick={editable ? (r) => setEditing(r as unknown as Extension) : undefined}
        exportable
        exportFileName={t('prod.extExport')}
      />
      <FormModal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('prod.extCreate') : t('prod.extEdit')}
        size="md"
        fields={[
          {
            name: 'label',
            label: t('prod.name'),
            required: true,
            placeholder: t('prod.extNamePh'),
          },
          { name: 'dept', label: t('prod.dept'), placeholder: t('prod.extDeptPh') },
          { name: 'extNo', label: t('prod.ext'), placeholder: t('prod.extNoPh') },
          {
            name: 'number',
            label: t('prod.transferTo'),
            type: 'tel',
            required: true,
            placeholder: t('prod.extTransferPh'),
          },
          { name: 'memo', label: t('prod.memo'), placeholder: t('prod.extMemoPh') },
        ]}
        initialValues={
          editing && editing !== 'new'
            ? {
                label: editing.label,
                dept: editing.dept ?? '',
                extNo: editing.extNo ?? '',
                number: editing.number,
                memo: editing.memo ?? '',
              }
            : { label: '', dept: '', extNo: '', number: '', memo: '' }
        }
        onSubmit={save}
      />
      <ConfirmModal
        open={!!del}
        danger
        title={del ? t('prod.extDeleteQ', { v0: del.label }) : ''}
        confirmLabel={t('prod.delete')}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) void remove(del);
          setDel(null);
        }}
      >
        {t('prod.extDeleteNote')}
      </ConfirmModal>
    </ListPage>
  );
}
