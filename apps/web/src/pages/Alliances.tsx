import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PARTNER_CONTRACT_STATUSES,
  type LeadStatus,
  type PartnerContractStatus,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { formatPhone } from '../lib/phone';
import { fmtDateTime } from '../lib/dateFormat';
import {
  Badge,
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  ListPage,
  Modal,
  RecordDetail,
  SegmentedControl,
  Textarea,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
} from '../components/ui';
import styles from './franchise.module.css';
import { LEAD_STATUS_LABEL, PARTNER_CONTRACT_STATUS_LABEL } from '../i18n/codes';

type Kind = 'AFFILIATE' | 'EXCLUSIVE';
interface Partner {
  id: string;
  code: string;
  type: Kind;
  name: string;
  phone: string | null;
  isActive: boolean;
  contractStatus: PartnerContractStatus | null;
  benefit: string | null;
  intake: string | null;
  memo: string | null;
  createdAt: string;
  leadCount: number;
  leadCountYear: number;
}
interface PartnerDetail extends Partner {
  recentLeads: {
    id: string;
    leadNo: string;
    status: string;
    createdAt: string;
    moveDate: string | null;
    orgUnit: { name: string } | null;
    customer: { name: string } | null;
  }[];
}

const KIND: Record<Kind, { label: string; move: string; scope: string; desc: string }> = {
  AFFILIATE: {
    label: i18n.t('ally.kind.AFFILIATE'),
    move: i18n.t('ally.move.AFFILIATE'),
    scope: i18n.t('ally.assign.AFFILIATE'),
    desc: i18n.t('ally.desc.AFFILIATE'),
  },
  EXCLUSIVE: {
    label: i18n.t('ally.kind.EXCLUSIVE'),
    move: i18n.t('ally.move.EXCLUSIVE'),
    scope: i18n.t('ally.assign.EXCLUSIVE'),
    desc: i18n.t('ally.desc.EXCLUSIVE'),
  },
};
const STATUS_COLOR: Record<PartnerContractStatus, 'success' | 'info' | 'primary' | 'neutral'> = {
  ACTIVE: 'success',
  AUTO_RENEW: 'info',
  NEW: 'primary',
  ENDED: 'neutral',
};
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

function StatusBadge({ s }: { s: PartnerContractStatus | null }) {
  if (!s) return <span className={styles.muted}>—</span>;
  return (
    <Badge variant="subtle" color={STATUS_COLOR[s]} size="sm">
      {PARTNER_CONTRACT_STATUS_LABEL[s]}
    </Badge>
  );
}

/**
 * 제휴·전속 — 제휴사(회원 이사, 본사·가맹점 배정)와 전속 계약사(임직원 이사, 본사만 배정) 목록.
 * 접수에 업체를 걸면 제휴이사·전속이사로 구분되고, 전속이사는 지점으로 배정되지 않는다.
 * 작업을 맡기는 외주 용역업체(거래처관리의 '외주(작업)')와는 다르다.
 */
export default function Alliances() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { tab: kind, setTab: setKind } = useTabParam<Kind>('AFFILIATE', 'kind');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const [rows, setRows] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partner | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [flt, setFlt] = useState<FilterValues>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Partner[]>(`/partners?type=${kind}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ally.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [kind, toast, touch]);
  useEffect(() => {
    void load();
  }, [load]);

  const k = KIND[kind];
  const fields: FormField[] = [
    { name: 'name', label: t('ally.f.name'), required: true, placeholder: t('ally.f.namePh') },
    {
      name: 'contractStatus',
      label: t('ally.f.status'),
      type: 'chips',
      alwaysShow: true,
      options: PARTNER_CONTRACT_STATUSES.map((v) => ({
        value: v,
        label: PARTNER_CONTRACT_STATUS_LABEL[v],
      })),
    },
    {
      name: 'benefit',
      label: kind === 'AFFILIATE' ? t('ally.f.benefitAff') : t('ally.f.benefitExc'),
      type: 'textarea',
      alwaysShow: true,
    },
    ...(kind === 'AFFILIATE'
      ? [
          {
            name: 'intake',
            label: t('ally.f.intake'),
            placeholder: t('ally.f.intakePh'),
            alwaysShow: true,
          } as FormField,
        ]
      : []),
    { name: 'phone', label: t('ally.f.contact'), type: 'tel', alwaysShow: true },
    { name: 'memo', label: t('ally.f.memo'), type: 'textarea' },
    { name: 'isActive', label: t('ally.f.active'), type: 'boolean' },
  ];
  const save = async (v: Record<string, unknown>) => {
    const isNew = editing === 'new';
    const str = (key: string) => (v[key] === '' || v[key] == null ? null : String(v[key]));
    const body = {
      type: kind,
      name: String(v.name ?? '').trim(),
      contractStatus: str('contractStatus'),
      benefit: str('benefit'),
      intake: str('intake'),
      phone: str('phone') ?? undefined,
      memo: str('memo'),
      isActive: v.isActive === undefined ? true : v.isActive === true || v.isActive === 'true',
    };
    try {
      const r = await api<{ id: string }>(
        isNew ? '/partners' : `/partners/${(editing as Partner).id}`,
        { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) },
      );
      toast({
        type: 'success',
        title: isNew ? t('ally.created', { v0: k.label }) : t('ally.saved'),
      });
      setEditing(null);
      await load();
      if (isNew && r.id) detail.open(r.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ally.saveFailed') });
      throw e;
    }
  };
  const initialOf = (p: Partner | 'new'): Record<string, string> =>
    p === 'new'
      ? { contractStatus: 'ACTIVE', isActive: 'true' }
      : {
          name: p.name,
          contractStatus: p.contractStatus ?? '',
          benefit: p.benefit ?? '',
          intake: p.intake ?? '',
          phone: p.phone ?? '',
          memo: p.memo ?? '',
          isActive: String(p.isActive),
        };
  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={
        editing === 'new'
          ? t('ally.createTitle', { v0: k.label })
          : t('ally.editTitle', { v0: k.label })
      }
      size="md"
      fields={fields}
      initialValues={editing ? initialOf(editing) : undefined}
      onSubmit={save}
    />
  );

  if (detail.id)
    return (
      <>
        <PartnerDetailView
          id={detail.id}
          onBack={detail.close}
          onEdit={(p) => setEditing(p)}
          onChanged={load}
        />
        {modal}
      </>
    );

  const active = rows.filter((r) => r.isActive && r.contractStatus !== 'ENDED');
  const year = rows.reduce((n, r) => n + r.leadCountYear, 0);
  const columns: Column[] = [
    {
      title: t('ally.col.no'),
      width: 104,
      render: (r) => <span className={styles.code}>{String(r.code)}</span>,
      exportValue: (r) => String(r.code),
    },
    { title: t('ally.f.name'), dataIndex: 'name', width: 200 },
    {
      title: t('ally.col.status'),
      width: 92,
      render: (r) => (
        <>
          <StatusBadge s={r.contractStatus as PartnerContractStatus | null} />
          {!r.isActive && <span className={styles.muted}> {t('ally.offSuffix')}</span>}
        </>
      ),
      exportValue: (r) =>
        r.contractStatus
          ? PARTNER_CONTRACT_STATUS_LABEL[r.contractStatus as PartnerContractStatus]
          : '',
    },
    {
      title: kind === 'AFFILIATE' ? t('ally.col.benefitAff') : t('ally.col.benefitExc'),
      flex: 1,
      minWidth: 260,
      render: (r) => (
        <span className={styles.clip2}>{(r.benefit as string | null)?.trim() || '—'}</span>
      ),
      exportValue: (r) => (r.benefit as string | null) ?? '',
    },
    ...(kind === 'AFFILIATE'
      ? [
          {
            title: t('ally.f.intake'),
            width: 150,
            render: (r: Row) => (
              <span className={styles.clip2}>{(r.intake as string | null)?.trim() || '—'}</span>
            ),
            exportValue: (r: Row) => (r.intake as string | null) ?? '',
          },
        ]
      : []),
    {
      title: t('ally.col.yearLeads'),
      width: 84,
      render: (r) => t('ally.countN', { v0: r.leadCountYear as number }),
    },
    {
      title: t('ally.col.allLeads'),
      width: 84,
      render: (r) => t('ally.countN', { v0: r.leadCount as number }),
    },
  ];

  const filterFields: FilterField[] = [
    { key: 'createdAt', label: t('ally.flt.createdAt'), type: 'date' },
    {
      key: 'contractStatus',
      label: t('ally.col.status'),
      type: 'multi',
      options: PARTNER_CONTRACT_STATUSES.map((v) => ({
        value: v,
        label: PARTNER_CONTRACT_STATUS_LABEL[v],
      })),
    },
    {
      key: 'isActive',
      label: t('ally.flt.use'),
      type: 'single',
      options: [
        { value: 'yes', label: t('ally.flt.on') },
        { value: 'no', label: t('ally.flt.off') },
      ],
    },
    {
      key: 'yearLeads',
      label: t('ally.flt.yearLeads'),
      type: 'single',
      options: [
        { value: 'yes', label: t('ally.flt.has') },
        { value: 'no', label: t('ally.flt.none') },
      ],
    },
  ];
  const shown = filterRows(rows, filterFields, flt, (r, key) =>
    key === 'isActive'
      ? r.isActive
        ? 'yes'
        : 'no'
      : key === 'yearLeads'
        ? r.leadCountYear > 0
          ? 'yes'
          : 'no'
        : r[key as 'createdAt' | 'contractStatus'],
  );

  const actions = can('PARTNER.CREATE') ? (
    <>
      <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
        {t('ally.import')}
      </Button>
      <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
        + {k.label} {t('ally.createBtn')}
      </Button>
    </>
  ) : undefined;

  return (
    <ListPage
      fit
      title={t('ally.title')}
      subtitle={t('ally.subtitle', { v0: KIND.AFFILIATE.desc, v1: KIND.EXCLUSIVE.desc })}
      onRefresh={load}
      updatedAt={updatedAt}
      actions={
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          options={[
            { value: 'AFFILIATE', label: t('ally.kind.AFFILIATE') },
            { value: 'EXCLUSIVE', label: t('ally.kind.EXCLUSIVE') },
          ]}
        />
      }
    >
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span>
            {k.label} {t('ally.partners')}
          </span>
          <b>{rows.length}</b>
          <small>
            {t('ally.activeLabel')} {active.length} {t('ally.inactiveLabel')}{' '}
            {rows.length - active.length}
          </small>
        </div>
        <div className={styles.kpi}>
          <span>
            {t('ally.thisYear')} {k.move} {t('ally.leads')}
          </span>
          <b>
            {year}
            {t('ally.countSuffix')}
          </b>
          <small>{t('ally.basis')}</small>
        </div>
        <div className={styles.kpi}>
          <span>{t('ally.assignLabel')}</span>
          <b>{k.scope}</b>
          <small>{kind === 'EXCLUSIVE' ? t('ally.branchBlocked') : t('ally.franchiseToo')}</small>
        </div>
      </div>
      <DataTable
        fit
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        columns={columns}
        rows={shown as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={t('ally.exportName', { v0: k.label })}
        toolbarActions={actions}
        onRowClick={(r) => detail.open(String(r.id))}
      />
      {modal}
      {importing && (
        <ImportModal
          kind={kind}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            void load();
          }}
        />
      )}
    </ListPage>
  );
}

function PartnerDetailView({
  id,
  onBack,
  onEdit,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onEdit: (p: Partner) => void;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [d, setD] = useState<PartnerDetail | null>(null);
  useEffect(() => {
    void api<PartnerDetail>(`/partners/${id}/detail`)
      .then(setD)
      .catch((e) =>
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ally.loadFailed') }),
      );
  }, [id, toast]);
  const remove = async () => {
    if (!d || !window.confirm(t('ally.deleteQ', { v0: d.name }))) return;
    try {
      await api(`/partners/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('ally.deleted') });
      await onChanged();
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ally.deleteFailed') });
    }
  };
  const k = d ? KIND[d.type] : null;
  return (
    <RecordDetail
      loading={!d}
      title={d?.name ?? ''}
      backLabel={t('ally.title')}
      onBack={onBack}
      actions={
        d ? (
          <>
            {can('PARTNER.DELETE') && (
              <Button variant="ghost" size="sm" onClick={() => void remove()}>
                {t('ally.delete')}
              </Button>
            )}
            {can('PARTNER.UPDATE') && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(d)}>
                {t('ally.edit')}
              </Button>
            )}
          </>
        ) : undefined
      }
      sections={
        d && k
          ? [
              {
                title: t('ally.basic'),
                items: [
                  { label: t('ally.col.no'), value: d.code },
                  { label: t('ally.kindLabel'), value: `${k.label} · ${k.move}` },
                  { label: t('ally.f.status'), value: <StatusBadge s={d.contractStatus} /> },
                  { label: t('ally.assignLabel'), value: k.scope },
                  ...(d.type === 'AFFILIATE'
                    ? [{ label: t('ally.f.intake'), value: d.intake }]
                    : []),
                  { label: t('ally.f.contact'), value: d.phone ? formatPhone(d.phone) : null },
                  {
                    label: t('ally.on'),
                    value: d.isActive ? t('ally.f.active') : t('ally.off'),
                  },
                  { label: t('ally.leads'), value: t('ally.allN', { v0: d.leadCount }) },
                ],
              },
              {
                title: d.type === 'AFFILIATE' ? t('ally.col.benefitAff') : t('ally.col.benefitExc'),
                items: [
                  {
                    label: t('ally.content'),
                    value: d.benefit ? <p className={styles.pre}>{d.benefit}</p> : null,
                    wide: true,
                  },
                  { label: t('ally.f.memo'), value: d.memo, wide: true },
                ],
              },
            ]
          : []
      }
    >
      {d && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>{t('ally.recentLeads')}</h3>
          {d.recentLeads.length ? (
            <DataTable
              bare
              pageSize={0}
              columns={[
                { title: t('ally.col.leadNo'), dataIndex: 'leadNo', width: 150 },
                {
                  title: t('ally.col.customer'),
                  dataIndex: 'customer',
                  render: (r) => (r.customer as { name: string } | null)?.name ?? '—',
                },
                {
                  title: t('ally.col.owner'),
                  dataIndex: 'orgUnit',
                  render: (r) => (r.orgUnit as { name: string } | null)?.name ?? '—',
                },
                {
                  title: t('ally.col.status'),
                  dataIndex: 'status',
                  render: (r) =>
                    LEAD_STATUS_LABEL[r.status as LeadStatus] ?? String(r.status ?? ''),
                },
                {
                  title: t('ally.col.receivedAt'),
                  dataIndex: 'createdAt',
                  width: 170,
                  render: (r) => fmtDateTime(String(r.createdAt)),
                },
                {
                  title: t('ally.col.moveDate'),
                  dataIndex: 'moveDate',
                  render: (r) => ymd(r.moveDate as string | null) || '—',
                },
              ]}
              rows={d.recentLeads as unknown as Row[]}
              onRowClick={(r) => navigate(`/leads/${String(r.id)}`)}
            />
          ) : (
            <p className={styles.muted}>
              {t('ally.noLeads1')}
              {t('ally.noLeads2')}
            </p>
          )}
        </section>
      )}
    </RecordDetail>
  );
}

/** 엑셀에서 표를 복사해 붙여넣기 — 머리글(업체명·상태·제휴내용·접수방식)로 칸을 맞춘다 */
function ImportModal({
  kind,
  onClose,
  onDone,
}: {
  kind: Kind;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseTable(text), [text]);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ created: number; skipped: number }>('/partners/import', {
        method: 'POST',
        body: JSON.stringify({ type: kind, rows: parsed.rows }),
      });
      toast({
        type: 'success',
        title: t('ally.importedN', {
          v0: r.created,
          v1: r.skipped ? t('ally.skippedN', { v0: r.skipped }) : '',
        }),
      });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('ally.importFailed') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('ally.importTitle', { v0: KIND[kind].label })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('ally.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!parsed.rows.length}
            onClick={() => void run()}
          >
            {parsed.rows.length}
            {t('ally.importN')}
          </Button>
        </>
      }
    >
      <div className={styles.importForm}>
        <p className={styles.muted}>
          {t('ally.importHelp1')}
          {t('ally.importHelp2')}
          {t('ally.importHelp3')}
        </p>
        <Textarea
          rows={10}
          value={text}
          placeholder={'업체명\t상태\t제휴내용\n경찰공제회\t진행중\t이사비용 10~20% 할인'}
          onChange={(e) => setText(e.target.value)}
        />
        {parsed.error ? (
          <p className={styles.warn}>{parsed.error}</p>
        ) : (
          parsed.rows.length > 0 && (
            <div className={styles.importTable}>
              <DataTable
                bare
                pageSize={20}
                columns={[
                  { title: t('ally.f.name'), dataIndex: 'name' },
                  {
                    title: t('ally.col.status'),
                    dataIndex: 'status',
                    render: (r) => String(r.status || '—'),
                  },
                  {
                    title: t('ally.content'),
                    dataIndex: 'benefit',
                    flex: 1,
                    render: (r) => String(r.benefit ?? '').slice(0, 60) || '—',
                  },
                  {
                    title: t('ally.f.intake'),
                    dataIndex: 'intake',
                    render: (r) => String(r.intake || '—'),
                  },
                ]}
                rows={parsed.rows.slice(0, 200).map((r, i) => ({ ...r, id: String(i) })) as Row[]}
              />
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

/** 탭으로 나뉜 표(엑셀 복사) — 따옴표로 묶인 칸 안의 줄바꿈도 읽는다 */
function parseTable(text: string): {
  rows: { name: string; status?: string; benefit?: string; intake?: string }[];
  error?: string;
} {
  if (!text.trim()) return { rows: [] };
  const cells: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === '\t') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cells.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    cells.push(row);
  }
  const norm = (s: string) => s.replace(/\s/g, '');
  const headerAt = cells.findIndex((r) => r.some((c) => /업체명|회사명|제휴사/.test(norm(c))));
  if (headerAt < 0) return { rows: [], error: i18n.t('ally.headerMissing') };
  const h = cells[headerAt].map(norm);
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x.includes(n)));
  const ni = col('업체명', '회사명', '제휴사');
  const si = col('상태');
  const bi = col('제휴내용', '내용', '혜택');
  const ii = col('접수방식', '무빙', '접수');
  const rows = cells
    .slice(headerAt + 1)
    .map((r) => ({
      name: (r[ni] ?? '').replace(/\s+/g, ' ').trim(),
      status: si >= 0 ? r[si]?.trim() : undefined,
      benefit: bi >= 0 ? r[bi]?.trim() : undefined,
      intake: ii >= 0 ? r[ii]?.replace(/\*?\s*접수방식\s*:\s*/, '').trim() : undefined,
    }))
    .filter((r) => r.name && !/^(업체명|no)$/i.test(r.name));
  return { rows };
}
