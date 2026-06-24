import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';

type Row = Record<string, unknown>;
type BadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

const STATUS: Record<string, { label: string; color: BadgeColor }> = {
  RECEIVED: { label: '접수', color: 'neutral' },
  CONSULT_ASSIGNED: { label: '상담배정', color: 'info' },
  CONSULT_TOSS: { label: '상담토스', color: 'info' },
  QUOTED: { label: '견적완료', color: 'warning' },
  CONTRACTED: { label: '계약', color: 'primary' },
  WORK_TOSS: { label: '작업토스', color: 'primary' },
  IN_PROGRESS: { label: '작업중', color: 'info' },
  DONE: { label: '완료', color: 'success' },
  CANCELED: { label: '취소', color: 'error' },
};
const SERVICE_LINES = [
  { value: 'MOVING', label: '이사(무빙)' },
  { value: 'LIVING', label: '리빙' },
  { value: 'CARE', label: '케어' },
  { value: 'B2B_MOVING', label: '기업이전' },
  { value: 'GENERAL', label: '일반' },
];

export default function Leads() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [transRow, setTransRow] = useState<Row | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [transTo, setTransTo] = useState('');
  const orgs = useOptions('/org-units', 'name');
  const customers = useOptions('/customers', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/leads'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (n: string, val: string) => setV((s) => ({ ...s, [n]: val }));

  const onCreate = async () => {
    if (!v.orgUnitId) {
      toast({ type: 'warning', title: `${t('nav.orgUnits')} — ${t('common.required')}` });
      return;
    }
    try {
      await api('/leads', { method: 'POST', body: JSON.stringify(v) });
      toast({ type: 'success', title: t('common.created') });
      setCreateOpen(false);
      setV({});
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const onTransition = async () => {
    if (!transRow || !transTo) return;
    try {
      await api(`/leads/${transRow.id as string}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to: transTo }),
      });
      toast({ type: 'success', title: t('common.created') });
      setTransRow(null);
      setTransTo('');
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>
          {t('nav.leads')}{' '}
          <span style={{ color: 'var(--ark-color-text-tertiary)', fontWeight: 400 }}>
            ({rows.length})
          </span>
        </h3>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          + {t('lead.register')}
        </Button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>접수번호</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>출처</TableHead>
              <TableHead>서비스</TableHead>
              <TableHead>이사 경로</TableHead>
              <TableHead>작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const s = STATUS[r.status as string];
              return (
                <TableRow key={String(r.id)}>
                  <TableCell>{String(r.leadNo)}</TableCell>
                  <TableCell>
                    <Badge color={s?.color ?? 'neutral'} variant="subtle">
                      {s?.label ?? String(r.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{String(r.source ?? '-')}</TableCell>
                  <TableCell>{String(r.serviceLine ?? '-')}</TableCell>
                  <TableCell>
                    {r.fromAddr || r.toAddr ? `${r.fromAddr ?? '-'} → ${r.toAddr ?? '-'}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTransRow(r);
                        setTransTo('');
                      }}
                    >
                      {t('lead.changeStatus')}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('lead.register')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={onCreate}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select
            label="담당 지점"
            value={v.orgUnitId ?? ''}
            onValueChange={(val) => setField('orgUnitId', val)}
            options={orgs}
            placeholder="지점 선택"
          />
          <Select
            label="고객"
            value={v.customerId ?? ''}
            onValueChange={(val) => setField('customerId', val)}
            options={customers}
            placeholder="고객 선택"
          />
          <Input
            label="접수경로"
            value={v.source ?? ''}
            placeholder="HOMEPAGE / AIBOT ..."
            onChange={(e) => setField('source', e.target.value)}
          />
          <Select
            label="서비스라인"
            value={v.serviceLine ?? ''}
            onValueChange={(val) => setField('serviceLine', val)}
            options={SERVICE_LINES}
            placeholder="서비스 선택"
          />
          <Input
            label="출발지"
            value={v.fromAddr ?? ''}
            onChange={(e) => setField('fromAddr', e.target.value)}
          />
          <Input
            label="도착지"
            value={v.toAddr ?? ''}
            onChange={(e) => setField('toAddr', e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={!!transRow}
        onOpenChange={(o) => !o && setTransRow(null)}
        title={`${t('lead.changeStatus')} — ${(transRow?.leadNo as string) ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransRow(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={onTransition}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Select
          label="변경할 상태"
          value={transTo}
          onValueChange={setTransTo}
          options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
          placeholder="상태 선택"
        />
      </Modal>
    </Card>
  );
}
