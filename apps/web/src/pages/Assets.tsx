import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ASSET_AMOUNT_UNIT,
  ASSET_AMOUNT_UNIT_LABEL,
  ASSET_KIND,
  ASSET_KIND_LABEL,
  type AssetAmountUnit,
  type AssetKind,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { ddayInfo, toInitial, useWorkDirectory, won, ymd, type PersonRef } from '../lib/workMenus';
import {
  Button,
  DataTable,
  FormModal,
  ListPage,
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import styles from './work.module.css';

interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  counterparty: string | null;
  refNo: string | null;
  startDate: string | null;
  endDate: string | null;
  amount: string | null;
  amountUnit: AssetAmountUnit | null;
  managerEmpId: string | null;
  manager: PersonRef | null;
  memo: string | null;
}

const KIND: StatusMap = {
  PATENT: { label: ASSET_KIND_LABEL.PATENT, color: 'primary' },
  TRADEMARK: { label: ASSET_KIND_LABEL.TRADEMARK, color: 'primary' },
  LEASE: { label: ASSET_KIND_LABEL.LEASE, color: 'info' },
  INSURANCE: { label: ASSET_KIND_LABEL.INSURANCE, color: 'success' },
  RENTAL: { label: ASSET_KIND_LABEL.RENTAL, color: 'neutral' },
  ETC: { label: ASSET_KIND_LABEL.ETC, color: 'neutral' },
};
/** 만료 30일 전부터 '주의' */
const WARN_DAYS = 30;

const amountText = (a: Asset) =>
  a.amount === null
    ? ''
    : `${a.amountUnit ? `${ASSET_AMOUNT_UNIT_LABEL[a.amountUnit]} ` : ''}${won(a.amount)}`;

function DDay({ date }: { date: string | null }) {
  const info = ddayInfo(date, WARN_DAYS);
  if (!info) return <>-</>;
  return (
    <StatusBadge
      value={info.level}
      map={{
        [info.level]: { label: info.level === 'over' ? '만료됨' : info.label, color: info.color },
      }}
    />
  );
}

type DueFilter = 'ALL' | 'SOON' | 'OVER';

/** 계약·자산 관리(경영관리팀 총무) — 특허·상표권, 임대차, 보험, 리스, 기타 계약. 만료·갱신일까지 D-day */
export default function Assets() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const dir = useWorkDirectory();
  const [rows, setRows] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<'ALL' | AssetKind>('ALL');
  const [due, setDue] = useState<DueFilter>('ALL');
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Asset[]>('/assets'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const fields: FormField[] = useMemo(
    () => [
      {
        name: 'kind',
        label: '종류',
        required: true,
        type: 'select',
        options: ASSET_KIND.map((k) => ({ value: k, label: ASSET_KIND_LABEL[k] })),
        pairWithNext: true,
      },
      { name: 'name', label: '이름', required: true, placeholder: '예: 서초 사옥 임대차' },
      {
        name: 'counterparty',
        label: '상대방',
        placeholder: '임대인·보험사·특허청 등',
        alwaysShow: true,
        pairWithNext: true,
      },
      { name: 'refNo', label: '등록·계약 번호', alwaysShow: true },
      { name: 'startDate', label: '시작일', type: 'date', alwaysShow: true, pairWithNext: true },
      { name: 'endDate', label: '만료·갱신일', type: 'date', alwaysShow: true },
      { name: 'amount', label: '금액(원)', type: 'number', alwaysShow: true, pairWithNext: true },
      {
        name: 'amountUnit',
        label: '금액 기준',
        type: 'select',
        options: ASSET_AMOUNT_UNIT.map((u) => ({ value: u, label: ASSET_AMOUNT_UNIT_LABEL[u] })),
        alwaysShow: true,
      },
      {
        name: 'managerEmpId',
        label: '관리 담당자',
        type: 'select',
        optionGroups: dir.peopleGroups,
      },
      { name: 'memo', label: '메모', type: 'textarea' },
    ],
    [dir],
  );

  const save = async (values: Record<string, unknown>) => {
    const isNew = editing === 'new';
    try {
      const saved = await api<Asset>(isNew ? '/assets' : `/assets/${(editing as Asset).id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: isNew ? '등록했습니다' : '저장했습니다' });
      await load();
      if (isNew) detail.open(saved.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const remove = async (a: Asset) => {
    if (!window.confirm(`'${a.name}'을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/assets/${a.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const formModal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? '계약·자산 등록' : '계약·자산 수정'}
      size="md"
      fields={fields}
      initialValues={
        editing && editing !== 'new'
          ? toInitial(
              editing as unknown as Record<string, unknown>,
              fields.map((f) => f.name),
            )
          : undefined
      }
      onSubmit={save}
    />
  );

  if (detail.id) {
    const d = rows.find((r) => r.id === detail.id);
    return (
      <>
        <RecordDetail
          loading={!d && loading}
          title={d ? d.name : '찾을 수 없습니다'}
          backLabel={t('nav.assets')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('ASSET.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    삭제
                  </Button>
                )}
                {can('ASSET.UPDATE') && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(d)}>
                    수정
                  </Button>
                )}
              </>
            ) : undefined
          }
          sections={
            d
              ? [
                  {
                    items: [
                      { label: '종류', value: <StatusBadge value={d.kind} map={KIND} /> },
                      { label: '상대방', value: d.counterparty },
                      { label: '등록·계약 번호', value: d.refNo },
                      { label: '시작일', value: ymd(d.startDate) },
                      { label: '만료·갱신일', value: ymd(d.endDate) },
                      { label: '남은 기간', value: d.endDate ? <DDay date={d.endDate} /> : null },
                      { label: '금액', value: amountText(d) },
                      { label: '관리 담당자', value: d.manager?.name },
                    ],
                  },
                  {
                    title: '메모',
                    items: [
                      {
                        label: '메모',
                        value: d.memo ? <p className={styles.body}>{d.memo}</p> : null,
                        wide: true,
                      },
                    ],
                  },
                ]
              : []
          }
        />
        {formModal}
      </>
    );
  }

  // 종류(머리글 아래 세그먼트) × 기한(검색창 옆 세그먼트)
  const byKind = kind === 'ALL' ? rows : rows.filter((r) => r.kind === kind);
  const dueMatch = (a: Asset, f: DueFilter) => {
    if (f === 'ALL') return true;
    const lv = ddayInfo(a.endDate, WARN_DAYS)?.level;
    return f === 'SOON' ? lv === 'soon' : lv === 'over';
  };
  const kindOptions = [
    { value: 'ALL', label: `전체 ${rows.length}` },
    ...ASSET_KIND.map((k) => ({
      value: k,
      label: `${ASSET_KIND_LABEL[k]} ${rows.filter((r) => r.kind === k).length}`,
    })),
  ];
  const dueCount = (f: DueFilter) => byKind.filter((r) => dueMatch(r, f)).length;
  const dueOptions = [
    { value: 'ALL', label: '전체' },
    { value: 'SOON', label: `${WARN_DAYS}일 이내 ${dueCount('SOON')}` },
    { value: 'OVER', label: `만료됨 ${dueCount('OVER')}` },
  ];

  const columns: Column[] = [
    {
      title: '종류',
      width: 100,
      render: (r) => <StatusBadge value={String(r.kind)} map={KIND} />,
    },
    { title: '이름', dataIndex: 'name', flex: 1, minWidth: 220 },
    { title: '상대방', dataIndex: 'counterparty', minWidth: 140 },
    { title: '번호', dataIndex: 'refNo', width: 150 },
    {
      title: '만료·갱신일',
      dataIndex: 'endDate',
      width: 120,
      render: (r) => ymd(r.endDate) || '-',
    },
    {
      title: '남은 기간',
      width: 110,
      render: (r) => <DDay date={(r as unknown as Asset).endDate} />,
      exportValue: (r) => ddayInfo(r.endDate)?.label ?? null,
    },
    {
      title: '금액',
      numeric: true,
      width: 160,
      render: (r) => amountText(r as unknown as Asset) || '-',
    },
    { title: '담당', width: 90, render: (r) => (r as unknown as Asset).manager?.name ?? '-' },
  ];

  return (
    <ListPage
      fit
      title={t('nav.assets')}
      onRefresh={load}
      updatedAt={updatedAt}
      footer={
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as 'ALL' | AssetKind)}
          options={kindOptions}
        />
      }
    >
      <DataTable
        fit
        columns={columns}
        rows={byKind.filter((r) => dueMatch(r, due)) as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => detail.open(String(r.id))}
        filters={
          <SegmentedControl
            value={due}
            onChange={(v) => setDue(v as DueFilter)}
            options={dueOptions}
          />
        }
        toolbarActions={
          can('ASSET.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              + 계약·자산 등록
            </Button>
          ) : undefined
        }
        exportable
        exportFileName="계약자산"
      />
      {formModal}
    </ListPage>
  );
}
