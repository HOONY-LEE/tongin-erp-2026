import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, DataTable, Modal, type Column } from '../../components/ui';
import { DocumentViewer } from '../../components/ui/DocumentViewer';

interface CustomerContract {
  id: string;
  contractNo: string;
  estimateId: string;
  status: string;
  contractDate: string | null;
  leadNo: string | null;
  moveDate: string | null;
}

/**
 * 상담 화면 머리의 [계약서] — 이 고객이 계약까지 간 적이 있으면 보인다.
 * 하나면 바로 계약서 창, 여럿이면 목록에서 고른다.
 */
export function ContractButton({
  customerId,
  customerName,
}: {
  customerId: string | null | undefined;
  customerName?: string | null;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<CustomerContract[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [doc, setDoc] = useState<CustomerContract | null>(null);

  useEffect(() => {
    setList([]);
    if (!customerId) return;
    let alive = true;
    api<CustomerContract[]>(`/customers/${customerId}/contracts`)
      .then((r) => alive && setList(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [customerId]);

  if (!list.length) return null;
  const columns: Column[] = [
    {
      title: t('cc.contractNo'),
      dataIndex: 'contractNo',
      render: (r) => <span className="id-mono">{String(r.contractNo)}</span>,
    },
    { title: t('cc.contractLeadNo'), dataIndex: 'leadNo' },
    { title: t('cc.contractMoveDate'), dataIndex: 'moveDate' },
  ];
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => (list.length === 1 ? setDoc(list[0]) : setPickOpen(true))}
      >
        <FileText size={14} /> {t('cc.contract')}
        {list.length > 1 ? ` ${list.length}` : ''}
      </Button>
      <Modal
        open={pickOpen}
        onOpenChange={(o) => !o && setPickOpen(false)}
        title={t('cc.contract')}
        size="md"
      >
        <DataTable
          bare
          noFooter
          pageSize={0}
          columns={columns}
          rows={list as unknown as Record<string, unknown>[]}
          onRowClick={(r) => {
            setPickOpen(false);
            setDoc(r as unknown as CustomerContract);
          }}
        />
      </Modal>
      {doc && (
        <DocumentViewer
          path={`/estimates/${doc.estimateId}/document`}
          estimatePath={`/estimates/${doc.estimateId}`}
          title={t('leads.contractTitle', {
            v0: doc.contractNo,
            v1: customerName ? ` · ${customerName}` : '',
          })}
          fileName={t('leads.contractFile', {
            v0: customerName || t('leads.customerFallback'),
            v1: doc.contractNo,
          })}
          onClose={() => setDoc(null)}
        />
      )}
    </>
  );
}
