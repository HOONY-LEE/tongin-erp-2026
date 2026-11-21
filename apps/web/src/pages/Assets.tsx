import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ASSET_AMOUNT_UNIT,
  ASSET_KIND,
  type AssetAmountUnit,
  type AssetKind,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { ddayInfo, toInitial, useWorkDirectory, won, ymd, type PersonRef } from '../lib/workMenus';
import {
  Button,
  DataTable,
  FilterButton,
  FormModal,
  ListPage,
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import styles from './work.module.css';
import { ASSET_AMOUNT_UNIT_LABEL, ASSET_KIND_LABEL } from '../i18n/codes';

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
  const { t } = useTranslation();
  const info = ddayInfo(date, WARN_DAYS);
  if (!info) return <>-</>;
  return (
    <StatusBadge
      value={info.level}
      map={{
        [info.level]: {
          label: info.level === 'over' ? t('asset.expired') : info.label,
          color: info.color,
        },
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
  /** 검색 옆 필터 — 기간(시작·만료)·담당자 */
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(이름·상대방·번호) */
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);
  /** 담당자 고르기 목록 — 거른 결과로 줄어들지 않게 본 적 있는 담당자를 모아 둔다 */
  const [managerSeen, setManagerSeen] = useState<Map<string, string>>(new Map());
  const query = filterQuery(flt, q);

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Asset[]>(`/assets${query}`);
      if (my !== seq.current) return;
      setRows(data);
      setManagerSeen((prev) => {
        const next = new Map(prev);
        for (const a of data) if (a.manager) next.set(a.manager.id, a.manager.name);
        return next.size === prev.size ? prev : next;
      });
      touch();
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [toast, t, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const fields: FormField[] = useMemo(
    () => [
      {
        name: 'kind',
        label: t('asset.kind'),
        required: true,
        type: 'select',
        options: ASSET_KIND.map((k) => ({ value: k, label: ASSET_KIND_LABEL[k] })),
        pairWithNext: true,
      },
      { name: 'name', label: t('asset.name'), required: true, placeholder: t('asset.namePh') },
      {
        name: 'counterparty',
        label: t('asset.counterparty'),
        placeholder: t('asset.counterpartyPh'),
        alwaysShow: true,
        pairWithNext: true,
      },
      { name: 'refNo', label: t('asset.refNo'), alwaysShow: true },
      {
        name: 'startDate',
        label: t('asset.start'),
        type: 'date',
        alwaysShow: true,
        pairWithNext: true,
      },
      { name: 'endDate', label: t('asset.end'), type: 'date', alwaysShow: true },
      {
        name: 'amount',
        label: t('asset.amountWon'),
        type: 'number',
        alwaysShow: true,
        pairWithNext: true,
      },
      {
        name: 'amountUnit',
        label: t('asset.amountBasis'),
        type: 'select',
        options: ASSET_AMOUNT_UNIT.map((u) => ({ value: u, label: ASSET_AMOUNT_UNIT_LABEL[u] })),
        alwaysShow: true,
      },
      {
        name: 'managerEmpId',
        label: t('asset.manager'),
        type: 'select',
        optionGroups: dir.peopleGroups,
      },
      { name: 'memo', label: t('asset.memo'), type: 'textarea' },
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
      toast({ type: 'success', title: isNew ? t('asset.created') : t('asset.saved') });
      await load();
      if (isNew) detail.open(saved.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const remove = async (a: Asset) => {
    if (!window.confirm(t('asset.deleteQ', { v0: a.name }))) return;
    try {
      await api(`/assets/${a.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('asset.deleted') });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('asset.deleteFailed') });
    }
  };

  const formModal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('asset.createTitle') : t('asset.editTitle')}
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
          title={d ? d.name : t('asset.notFound')}
          backLabel={t('nav.assets')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('ASSET.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    {t('asset.delete')}
                  </Button>
                )}
                {can('ASSET.UPDATE') && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(d)}>
                    {t('asset.edit')}
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
                      { label: t('asset.kind'), value: <StatusBadge value={d.kind} map={KIND} /> },
                      { label: t('asset.counterparty'), value: d.counterparty },
                      { label: t('asset.refNo'), value: d.refNo },
                      { label: t('asset.start'), value: ymd(d.startDate) },
                      { label: t('asset.end'), value: ymd(d.endDate) },
                      {
                        label: t('asset.remaining'),
                        value: d.endDate ? <DDay date={d.endDate} /> : null,
                      },
                      { label: t('asset.amount'), value: amountText(d) },
                      { label: t('asset.manager'), value: d.manager?.name },
                    ],
                  },
                  {
                    title: t('asset.memo'),
                    items: [
                      {
                        label: t('asset.memo'),
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

  const managers = [...managerSeen].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('asset.flt.period'),
      type: 'date',
      options: [
        { value: 'endDate', label: t('asset.flt.end') },
        { value: 'startDate', label: t('asset.flt.start') },
      ],
    },
    ...(managers.length
      ? [
          {
            key: 'managerEmpId',
            label: t('asset.flt.manager'),
            type: 'multi',
            options: [
              ...managers.map(([value, label]) => ({ value, label })),
              { value: '', label: t('asset.flt.noManager') },
            ],
          } as FilterField,
        ]
      : []),
  ];
  // 필터·검색은 서버가 걸어 보낸다 — 종류 탭·기한 숫자도 걸린 목록 기준
  const picked = rows;
  // 종류(머리글 아래 세그먼트) × 기한(검색창 옆 세그먼트)
  const byKind = kind === 'ALL' ? picked : picked.filter((r) => r.kind === kind);
  const dueMatch = (a: Asset, f: DueFilter) => {
    if (f === 'ALL') return true;
    const lv = ddayInfo(a.endDate, WARN_DAYS)?.level;
    return f === 'SOON' ? lv === 'soon' : lv === 'over';
  };
  const kindOptions = [
    { value: 'ALL', label: t('asset.allN', { v0: picked.length }) },
    ...ASSET_KIND.map((k) => ({
      value: k,
      label: `${ASSET_KIND_LABEL[k]} ${picked.filter((r) => r.kind === k).length}`,
    })),
  ];
  const dueCount = (f: DueFilter) => byKind.filter((r) => dueMatch(r, f)).length;
  const dueOptions = [
    { value: 'ALL', label: t('asset.all') },
    { value: 'SOON', label: t('asset.withinN', { v0: WARN_DAYS, v1: dueCount('SOON') }) },
    { value: 'OVER', label: t('asset.expiredN', { v0: dueCount('OVER') }) },
  ];

  const columns: Column[] = [
    {
      title: t('asset.kind'),
      width: 100,
      render: (r) => <StatusBadge value={String(r.kind)} map={KIND} />,
    },
    { title: t('asset.name'), dataIndex: 'name', flex: 1, minWidth: 220 },
    { title: t('asset.counterparty'), dataIndex: 'counterparty', minWidth: 140 },
    { title: t('asset.no'), dataIndex: 'refNo', width: 150 },
    {
      title: t('asset.end'),
      dataIndex: 'endDate',
      width: 120,
      render: (r) => ymd(r.endDate) || '-',
    },
    {
      title: t('asset.remaining'),
      width: 110,
      render: (r) => <DDay date={(r as unknown as Asset).endDate} />,
      exportValue: (r) => ddayInfo(r.endDate)?.label ?? null,
    },
    {
      title: t('asset.amount'),
      numeric: true,
      width: 160,
      render: (r) => amountText(r as unknown as Asset) || '-',
    },
    {
      title: t('asset.owner'),
      width: 90,
      render: (r) => (r as unknown as Asset).manager?.name ?? '-',
    },
  ];

  return (
    <ListPage fit title={t('nav.assets')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        tabs={
          <SegmentedControl
            value={kind}
            onChange={(v) => setKind(v as 'ALL' | AssetKind)}
            options={kindOptions}
          />
        }
        fit
        columns={columns}
        rows={byKind.filter((r) => dueMatch(r, due)) as unknown as Row[]}
        onSearch={setQ}
        loading={loading}
        onRowClick={(r) => detail.open(String(r.id))}
        filters={
          <>
            <FilterButton
              fields={filterFields}
              value={flt}
              onChange={setFlt}
              limited={rows.length >= LIST_LIMIT}
            />
            <SegmentedControl
              value={due}
              onChange={(v) => setDue(v as DueFilter)}
              options={dueOptions}
            />
          </>
        }
        toolbarActions={
          can('ASSET.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              {t('asset.createBtn')}
            </Button>
          ) : undefined
        }
        exportable
        exportFileName={t('asset.exportName')}
      />
      {formModal}
    </ListPage>
  );
}
