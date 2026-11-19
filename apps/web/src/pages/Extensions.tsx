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
 * 보기는 상담원 모두, 고치기는 상담 관리자(상담 콘솔 전체 보기 권한).
 */
export default function Extensions() {
  const toast = useToast();
  const { can } = useAuth();
  const editable = can('CS_CALL.ALL');
  const rows = useExtensions();
  const [editing, setEditing] = useState<Extension | 'new' | null>(null);
  const [del, setDel] = useState<Extension | null>(null);

  const columns: Column[] = [
    { title: '이름', dataIndex: 'label', width: 140 },
    {
      title: '부서',
      dataIndex: 'dept',
      render: (r) => (r.dept as string | null) ?? '-',
      width: 120,
    },
    {
      title: '내선번호',
      dataIndex: 'extNo',
      render: (r) => (r.extNo as string | null) ?? '-',
      width: 100,
    },
    {
      title: '돌려줄 번호',
      dataIndex: 'number',
      render: (r) => <PhoneCell value={r.number as string} link={false} />,
      width: 150,
    },
    { title: '메모', dataIndex: 'memo', flex: 1, minWidth: 140 },
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
                aria-label={`${r.label as string} 지우기`}
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
      toast({ type: 'success', title: '내선을 저장했습니다' });
      setEditing(null);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
      throw e;
    }
  };
  const remove = async (x: Extension) => {
    try {
      await api(`/cs-transfer-targets/${x.id}`, { method: 'DELETE' });
      await reloadExtensions();
      toast({ type: 'success', title: '내선을 지웠습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  return (
    <ListPage
      fit
      title="내선 관리"
      subtitle="상담원이 통화를 돌려줄 사무실 직원·부서 번호입니다. 등록하면 상담 콘솔 '내선' 목록에서 한 번에 돌려줄 수 있습니다."
      actions={
        editable ? (
          <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
            내선 등록
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
        exportFileName="내선목록"
      />
      <FormModal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? '내선 등록' : '내선 수정'}
        size="md"
        fields={[
          { name: 'label', label: '이름', required: true, placeholder: '예: 홍길동 과장' },
          { name: 'dept', label: '부서', placeholder: '예: 영업팀' },
          { name: 'extNo', label: '내선번호', placeholder: '예: 3001(화면 표시용)' },
          {
            name: 'number',
            label: '돌려줄 번호',
            type: 'tel',
            required: true,
            placeholder: '예: 070-1234-5678(직원 070·지역번호·휴대폰)',
          },
          { name: 'memo', label: '메모', placeholder: '예: 오전만 근무' },
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
        title={del ? `'${del.label}' 내선을 지울까요?` : ''}
        confirmLabel="지우기"
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) void remove(del);
          setDel(null);
        }}
      >
        상담 콘솔 내선 목록과 돌려주기에서 빠집니다.
      </ConfirmModal>
    </ListPage>
  );
}
