import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate, fmtDateTime } from '../lib/dateFormat';
import { CalendarClock, Mail, MessageSquare, Phone, Search, StickyNote, Users } from 'lucide-react';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '@sunghoon_lee/akron-ui';
import {
  CRM_INTERESTS,
  CRM_PHASES,
  CRM_PIPELINES,
  crmPhaseOf,
  type CrmPhase,
  type CrmImportPreview,
  type CrmActivityKind,
  type CrmActivityView,
  type CrmInterest,
  type CrmLeadView,
  type CrmPipelineDef,
  type CrmPipelineKey,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDirectory } from '../lib/approvals';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { formatPhone } from '../lib/phone';
import {
  Badge,
  Button,
  DataTable,
  FormModal,
  ListPage,
  ListToolbar,
  RecordDetail,
  SegmentedControl,
  Textarea,
  Modal,
  Input,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import styles from './franchise.module.css';
import { CRM_ACTIVITY_LABEL, CRM_INTEREST_LABEL } from '../i18n/codes';

type View = 'board' | 'list';
const won = (n: number) => i18n.t('crm.won', { v0: n.toLocaleString('ko-KR') });
/** 목록·카드용 짧은 금액 — 7.5억 · 3,000만 */
const wonShort = (n: number) =>
  n >= 1e8
    ? i18n.t('crm.eok', { v0: (n / 1e8).toFixed(n % 1e8 ? 1 : 0).replace(/\.0$/, '') })
    : n >= 1e4
      ? i18n.t('crm.man', { v0: Math.round(n / 1e4).toLocaleString('ko-KR') })
      : i18n.t('crm.won', { v0: n.toLocaleString('ko-KR') });
const stageLabel = (def: CrmPipelineDef, k: string | null) =>
  (k && def.stages.find((s) => s.key === k)?.label) ?? k ?? '';
const sourceLabel = (def: CrmPipelineDef, k: string) =>
  def.sources.find((s) => s.key === k)?.label ?? k;
const fieldText = (f: CrmPipelineDef['fields'][number], v: unknown) =>
  v == null || v === ''
    ? null
    : f.type === 'number'
      ? `${Number(v).toLocaleString('ko-KR')}${f.unit ?? ''}`
      : String(v);
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
/** 목록용 날짜 — 2026-11-20 */
const shortYmd = (iso: string) => fmtDate(iso);
const md = (s: string) => fmtDate(s);
const when = (iso: string) => fmtDateTime(iso);

function StageBadge({ def, stage }: { def: CrmPipelineDef; stage: string }) {
  const s = def.stages.find((x) => x.key === stage);
  return (
    <span className={styles.stage}>
      <i style={{ background: s?.color }} />
      {s?.label ?? stage}
    </span>
  );
}

function NextAction({ l }: { l: CrmLeadView }) {
  const { t } = useTranslation();
  if (!l.nextActionAt) return <span className={styles.muted}>—</span>;
  const today = kstToday();
  const cls = l.nextActionAt < today ? styles.over : l.nextActionAt === today ? styles.soon : '';
  return (
    <span className={cls} title={l.nextAction ?? undefined}>
      {l.nextActionAt}
      {l.nextActionAt < today ? t('crm.overdue') : l.nextActionAt === today ? t('crm.today') : ''}
    </span>
  );
}

/**
 * 영업 CRM 공통 화면 — 가맹 영업(/franchise-leads) · 기업영업(/b2b-crm).
 * 단계·유입 경로·추가 항목·금액 이름은 CRM_PIPELINES 설정에서 오고 화면 코드는 하나다.
 * 칸반·목록, 상담 기록(통화·문자·메일·미팅·메모), 다음 연락일
 */
export default function Crm({ pipeline }: { pipeline: CrmPipelineKey }) {
  const { t } = useTranslation();
  const def = CRM_PIPELINES[pipeline];
  const base = `/crm/${pipeline}/leads`;
  const OPEN = def.stages.filter((s) => s.open).map((s) => s.key);
  const toast = useToast();
  const { user, can } = useAuth();
  const { people } = useDirectory();
  const [rows, setRows] = useState<CrmLeadView[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [editing, setEditing] = useState<CrmLeadView | 'new' | null>(null);
  const [links, setLinks] = useState<{ value: string; label: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const { tab: view, setTab: setView } = useTabParam<View>('list', 'view');
  // 위 탭 — 리드 · 상담 진행(영업 기회) · 계약(수주) · 보류·실패 · 전체
  const { tab: phase, setTab: setPhase } = useTabParam<CrmPhase | 'all'>('lead', 'phase');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<CrmLeadView[]>(base));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [base, toast, touch]);
  useEffect(() => {
    void load();
    if (def.link === 'BRANCH')
      void api<{ rows: { orgUnitId: string; name: string }[] }>('/franchise/branches')
        .then((r) => setLinks(r.rows.map((b) => ({ value: b.orgUnitId, label: b.name }))))
        .catch(() => undefined);
    else if (def.link === 'PARTNER')
      void api<{ id: string; name: string }[]>('/partners')
        .then((r) => setLinks(r.map((b) => ({ value: b.id, label: b.name }))))
        .catch(() => undefined);
  }, [load, def.link]);

  const term = q.trim();
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mineOnly || r.ownerEmpId === user?.employeeId) &&
          (!term ||
            [r.companyName, r.contactName, r.region, r.ownerName, r.memo, r.email].some((x) =>
              x?.includes(term),
            ) ||
            (term.replace(/\D/g, '').length >= 3 &&
              (r.phone ?? '').includes(term.replace(/\D/g, '')))),
      ),
    [rows, mineOnly, term, user?.employeeId],
  );
  const today = kstToday();
  const weekLater = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const open = rows.filter((r) => OPEN.includes(r.stage));
  const dueSoon = open.filter((r) => r.nextActionAt && r.nextActionAt <= weekLater).length;

  const changeStage = async (l: CrmLeadView, stage: string) => {
    try {
      await api(`${base}/${l.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) });
      toast({ type: 'success', title: t('crm.moved', { v0: stageLabel(def, stage) }) });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.changeFailed') });
    }
  };

  const personOptions = useMemo(
    () =>
      people.map((p) => ({
        value: p.id,
        label: `${p.name}${p.positionName ? ` ${p.positionName}` : ''} · ${p.orgUnitName ?? ''}`,
      })),
    [people],
  );
  const fields: FormField[] = [
    { name: 'companyName', label: def.companyLabel, required: true },
    { name: 'contactName', label: def.contactLabel, alwaysShow: true, pairWithNext: true },
    ...(pipeline === 'B2B'
      ? [
          {
            name: 'contactTitle',
            label: t('crm.f.title'),
            placeholder: t('crm.f.titlePh'),
            alwaysShow: true,
          },
        ]
      : []),
    {
      name: 'phone',
      label: t('crm.f.phone'),
      type: 'tel',
      alwaysShow: true,
      pairWithNext: pipeline === 'B2B',
    },
    ...(pipeline === 'B2B' ? [{ name: 'email', label: t('crm.f.email'), alwaysShow: true }] : []),
    {
      name: 'region',
      label: def.regionLabel,
      placeholder: t('crm.f.regionPh'),
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'source',
      label: t('crm.f.source'),
      type: 'select',
      options: def.sources.map((v) => ({ value: v.key, label: v.label })),
      alwaysShow: true,
    },
    {
      name: 'stage',
      label: t('crm.f.stage'),
      type: 'chips',
      options: def.stages.map((v) => ({ value: v.key, label: v.label })),
      alwaysShow: true,
    },
    {
      name: 'interest',
      label: t('crm.f.interest'),
      type: 'chips',
      options: CRM_INTERESTS.map((v) => ({ value: v, label: CRM_INTEREST_LABEL[v] })),
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'ownerEmpId',
      label: t('crm.f.owner'),
      type: 'select',
      options: personOptions,
      searchable: true,
      alwaysShow: true,
    },
    ...(def.amountLabel
      ? [
          {
            name: 'amount',
            label: t('crm.f.amount', { v0: def.amountLabel }),
            type: 'number',
            alwaysShow: true,
            pairWithNext: !!def.expectedLabel,
          },
        ]
      : []),
    ...(def.expectedLabel
      ? [{ name: 'expectedAt', label: def.expectedLabel, type: 'date', alwaysShow: true }]
      : []),
    {
      name: 'nextActionAt',
      label: t('crm.f.nextAt'),
      type: 'date',
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'nextAction',
      label: t('crm.f.nextAction'),
      placeholder: t('crm.f.nextActionPh'),
      alwaysShow: true,
    },
    ...def.fields.map((f, i) => ({
      name: `f_${f.key}`,
      label: f.unit ? `${f.label}(${f.unit})` : f.label,
      type: f.type,
      placeholder: f.placeholder,
      options: f.options?.map((o) => ({ value: o, label: o })),
      pairWithNext: f.type !== 'textarea' && i % 2 === 0 && i < def.fields.length - 1,
    })),
    { name: 'memo', label: t('crm.f.memo'), type: 'textarea' },
    { name: 'lostReason', label: t('crm.f.lostReason') },
    ...(def.link
      ? [{ name: 'linkId', label: def.linkLabel, type: 'select', options: links, searchable: true }]
      : []),
  ] as FormField[];
  const save = async (v: Record<string, unknown>) => {
    const isNew = editing === 'new';
    const str = (k: string) => (v[k] === '' || v[k] == null ? null : String(v[k]));
    const extra = Object.fromEntries(def.fields.map((f) => [f.key, str(`f_${f.key}`)]));
    const body = {
      companyName: String(v.companyName ?? '').trim(),
      contactName: str('contactName'),
      ...(pipeline === 'B2B' && { contactTitle: str('contactTitle'), email: str('email') }),
      phone: str('phone'),
      region: str('region'),
      source: v.source || def.sources[0].key,
      stage: v.stage || def.stages[0].key,
      interest: v.interest || 'B',
      ownerEmpId: str('ownerEmpId'),
      ...(def.amountLabel && { amount: str('amount') == null ? null : Number(v.amount) }),
      ...(def.expectedLabel && { expectedAt: str('expectedAt') }),
      nextActionAt: str('nextActionAt'),
      nextAction: str('nextAction'),
      memo: str('memo'),
      lostReason: str('lostReason'),
      fields: extra,
      ...(def.link && { linkId: str('linkId') }),
    };
    try {
      const res = await api<{ id?: string }>(
        isNew ? base : `${base}/${(editing as CrmLeadView).id}`,
        { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) },
      );
      toast({ type: 'success', title: isNew ? t('crm.created') : t('crm.saved') });
      setEditing(null);
      await load();
      if (isNew && res.id) detail.open(res.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.saveFailed') });
      throw e;
    }
  };
  const initialOf = (l: CrmLeadView | 'new') =>
    l === 'new'
      ? {
          source: def.sources[0].key,
          stage: def.stages[0].key,
          interest: 'B',
          ownerEmpId: user?.employeeId ?? '',
        }
      : Object.fromEntries(
          [
            ...Object.entries(l),
            ...Object.entries(l.fields ?? {}).map(([k, x]) => [`f_${k}`, x] as const),
          ]
            .filter(([k, x]) => x !== null && fields.some((f) => f.name === k))
            .map(([k, x]) => [k, String(x)]),
        );
  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('crm.createTitle', { v0: def.label }) : t('crm.editTitle')}
      size="md"
      fields={fields}
      initialValues={editing ? initialOf(editing) : undefined}
      onSubmit={save}
    />
  );
  const addButton = can(`${def.perm}.CREATE`) ? (
    <>
      <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
        {t('crm.import')}
      </Button>
      <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
        {t('crm.createBtn')}
      </Button>
    </>
  ) : undefined;

  if (detail.id) {
    return (
      <>
        <LeadDetail
          def={def}
          id={detail.id}
          canEdit={can(`${def.perm}.UPDATE`)}
          canDelete={can(`${def.perm}.DELETE`)}
          onBack={detail.close}
          onEdit={(l) => setEditing(l)}
          onChanged={load}
        />
        {modal}
      </>
    );
  }

  const viewSwitch = (
    <SegmentedControl
      value={view}
      onChange={(v) => setView(v as View)}
      options={[
        { value: 'list', label: t('crm.view.list') },
        { value: 'board', label: t('crm.view.board') },
      ]}
    />
  );
  const filters = (
    <SegmentedControl
      value={mineOnly ? 'mine' : 'all'}
      onChange={(v) => setMineOnly(v === 'mine')}
      options={[
        { value: 'all', label: t('crm.scope.all') },
        { value: 'mine', label: t('crm.scope.mine') },
      ]}
    />
  );
  const search = (
    <div className="sft-toolbar__search-wrap">
      <span className="sft-toolbar__search-icon" aria-hidden="true">
        <Search size={15} />
      </span>
      <input
        className="sft-toolbar__search"
        type="search"
        value={q}
        placeholder={t('crm.searchPh')}
        aria-label={t('crm.search')}
        onChange={(e) => setQ(e.target.value)}
      />
    </div>
  );

  const phaseRows = filtered.filter((r) => phase === 'all' || crmPhaseOf(def, r.stage) === phase);
  const inPhase = rows.filter((r) => phase === 'all' || crmPhaseOf(def, r.stage) === phase);
  const sum = (list: CrmLeadView[]) => list.reduce((n, r) => n + (r.amount ?? 0), 0);
  const wonN = rows.filter((r) => crmPhaseOf(def, r.stage) === 'won').length;
  const lostN = rows.filter((r) => def.stages.find((s) => s.key === r.stage)?.lost).length;
  const holdN = rows.filter((r) => crmPhaseOf(def, r.stage) === 'closed').length - lostN;
  const amountName = def.amountLabel?.replace(/\(.*\)/, '') ?? t('crm.amount');
  const kpis: { label: string; value: string; sub?: string }[] =
    phase === 'lead' || phase === 'all'
      ? [
          {
            label: t('crm.countOf', { v0: def.phaseLabels.lead }),
            value: `${inPhase.length}`,
            sub: t('crm.dueSoon', { v0: dueSoon }),
          },
          ...(def.amountLabel
            ? [{ label: `${def.phaseLabels.lead} ${amountName}`, value: won(sum(inPhase)) }]
            : []),
          {
            label: t('crm.hotInterest'),
            value: inPhase.length
              ? `${Math.round((inPhase.filter((r) => r.interest === 'A').length / inPhase.length) * 100)}%`
              : '—',
            sub: t('crm.placesN', { v0: inPhase.filter((r) => r.interest === 'A').length }),
          },
        ]
      : phase === 'deal'
        ? [
            {
              label: t('crm.dealsOf', { v0: def.phaseLabels.deal }),
              value: `${inPhase.length}`,
              sub: t('crm.dueSoon', { v0: dueSoon }),
            },
            ...(def.amountLabel ? [{ label: t('crm.pipeline'), value: won(sum(inPhase)) }] : []),
            {
              label: t('crm.conversion'),
              value: wonN + lostN ? `${Math.round((wonN / (wonN + lostN)) * 100)}%` : '—',
              sub: t('crm.wonLost', { v0: def.phaseLabels.won, v1: wonN, v2: lostN }),
            },
          ]
        : phase === 'won'
          ? [
              { label: t('crm.dealsOf', { v0: def.phaseLabels.won }), value: `${inPhase.length}` },
              ...(def.amountLabel
                ? [
                    { label: t('crm.totalOf', { v0: amountName }), value: won(sum(inPhase)) },
                    {
                      label: t('crm.avgOf', { v0: amountName }),
                      value: inPhase.length ? won(Math.round(sum(inPhase) / inPhase.length)) : '—',
                    },
                  ]
                : []),
            ]
          : [
              { label: t('crm.onHold'), value: `${holdN}` },
              { label: t('crm.lost'), value: `${lostN}` },
            ];

  const columns: Column[] = [
    {
      title: 'ID',
      width: 92,
      render: (r) => <span className={styles.code}>{(r as unknown as CrmLeadView).code}</span>,
      exportValue: (r) => (r as unknown as CrmLeadView).code,
    },
    {
      title: t('crm.col.customer'),
      width: 80,
      render: (r) => (r.contactName as string) ?? '—',
      exportValue: (r) => (r.contactName as string) ?? '',
    },
    {
      title: pipeline === 'B2B' ? t('crm.col.company') : t('crm.col.business'),
      dataIndex: 'companyName',
      flex: 1,
      minWidth: 140,
    },
    {
      title: t('crm.f.phone'),
      render: (r) => (r.phone ? formatPhone(String(r.phone)) : '—'),
      exportValue: (r) => (r.phone ? formatPhone(String(r.phone)) : ''),
    },
    // 유입 경로는 리드 단계에서 주로 본다 — 진행·계약 탭은 금액·다음 연락을 보이려고 뺀다
    ...(phase === 'lead' || phase === 'all'
      ? [
          {
            title: t('crm.col.source'),
            width: 96,
            render: (r: Row) => sourceLabel(def, String(r.source)),
          },
        ]
      : []),
    ...(phase === 'lead' || phase === 'all'
      ? [
          {
            title: t('crm.col.region'),
            width: 100,
            render: (r: Row) => (r.region as string) ?? '—',
            exportValue: (r: Row) => (r.region as string) ?? '',
          },
        ]
      : []),
    {
      title: t('crm.f.stage'),
      width: 100,
      render: (r) => <StageBadge def={def} stage={String(r.stage)} />,
      exportValue: (r) => stageLabel(def, String(r.stage)),
    },
    {
      title: t('crm.f.owner'),
      width: 80,
      render: (r) =>
        r.ownerName ? <span className={styles.personChip}>{r.ownerName as string}</span> : '—',
      exportValue: (r) => (r.ownerName as string) ?? '',
    },
    {
      title: t('crm.col.lastContact'),
      width: 96,
      render: (r) => (r.lastActivityAt ? shortYmd(String(r.lastActivityAt)) : '—'),
      exportValue: (r) => (r.lastActivityAt ? String(r.lastActivityAt).slice(0, 10) : ''),
    },
    ...(def.amountLabel && phase !== 'lead'
      ? [
          {
            title: amountName,
            width: 90,
            render: (r: Row) => (r.amount == null ? '—' : wonShort(Number(r.amount))),
            exportValue: (r: Row) => (r.amount == null ? '' : String(r.amount)),
          },
        ]
      : []),
    ...(phase === 'won' && def.link
      ? [
          {
            title: def.link === 'BRANCH' ? t('crm.col.branch') : t('crm.col.partner'),
            width: 100,
            render: (r: Row) => (r.linkName as string) ?? '—',
            exportValue: (r: Row) => (r.linkName as string) ?? '',
          },
        ]
      : [
          {
            title: t('crm.col.next'),
            width: 110,
            render: (r: Row) => <NextAction l={r as unknown as CrmLeadView} />,
            exportValue: (r: Row) => (r.nextActionAt as string) ?? '',
          },
        ]),
    {
      title: t('crm.f.interest'),
      width: 72,
      render: (r) => (
        <span className={`${styles.interest} ${styles[`interest${r.interest as CrmInterest}`]}`}>
          {CRM_INTEREST_LABEL[r.interest as CrmInterest]}
        </span>
      ),
      exportValue: (r) => CRM_INTEREST_LABEL[r.interest as CrmInterest],
    },
  ];

  const phaseTabs = (
    <SegmentedControl
      value={phase}
      onChange={(v) => setPhase(v as CrmPhase | 'all')}
      options={[
        ...CRM_PHASES.map((p) => ({ value: p, label: def.phaseLabels[p] })),
        { value: 'all', label: t('crm.scope.all') },
      ]}
    />
  );

  return (
    <ListPage
      fit
      title={def.label}
      subtitle={t('crm.subtitle', { v0: def.description })}
      onRefresh={load}
      updatedAt={updatedAt}
      actions={view === 'list' ? phaseTabs : undefined}
    >
      {view === 'list' ? (
        <>
          <div className={styles.kpis}>
            {kpis.map((k) => (
              <div key={k.label} className={styles.kpi}>
                <span>{k.label}</span>
                <b>{k.value}</b>
                {k.sub && <small>{k.sub}</small>}
              </div>
            ))}
          </div>
          <DataTable
            fit
            columns={columns}
            rows={phaseRows as unknown as Row[]}
            loading={loading}
            exportable
            exportFileName={`${def.label.replace(/\s/g, '')}_${phase === 'all' ? t('crm.scope.all') : def.phaseLabels[phase]}`}
            filters={filters}
            viewSwitch={viewSwitch}
            toolbarActions={addButton}
            onRowClick={(r) => detail.open(String(r.id))}
          />
        </>
      ) : (
        <Board
          def={def}
          rows={filtered}
          loading={loading}
          toolbar={
            <ListToolbar
              search={search}
              filters={filters}
              viewSwitch={viewSwitch}
              actions={addButton}
            />
          }
          canMove={can(`${def.perm}.UPDATE`)}
          onMove={(l, s) => void changeStage(l, s)}
          onOpen={detail.open}
        />
      )}
      {modal}
      {importing && (
        <ImportModal
          def={def}
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

function Board({
  def,
  rows,
  loading,
  toolbar,
  canMove,
  onMove,
  onOpen,
}: {
  def: CrmPipelineDef;
  rows: CrmLeadView[];
  loading: boolean;
  toolbar: React.ReactNode;
  canMove: boolean;
  onMove: (l: CrmLeadView, s: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const today = kstToday();
  const make = (list: CrmLeadView[]): KanbanColumn[] =>
    def.stages
      .filter((s) => s.open || s.won)
      .map((s) => ({
        id: s.key,
        title: s.label,
        color: s.color,
        cards: list
          .filter((r) => r.stage === s.key)
          .map(
            (r): KanbanCard => ({
              id: r.id,
              title: r.companyName,
              footer: (
                <div className={styles.kFooter}>
                  <div className={styles.kRow}>
                    <span>{[r.contactName, r.region].filter(Boolean).join(' · ') || '—'}</span>
                    <span className={styles.kChip}>{CRM_INTEREST_LABEL[r.interest]}</span>
                  </div>
                  <div className={styles.kRow}>
                    <span
                      className={
                        r.nextActionAt && r.nextActionAt < today
                          ? styles.over
                          : r.nextActionAt === today
                            ? styles.soon
                            : styles.muted
                      }
                    >
                      <CalendarClock size={11} aria-hidden /> {t('crm.col.next')}{' '}
                      {r.nextActionAt ? md(r.nextActionAt) : '—'}
                    </span>
                    {r.amount != null && <span className={styles.muted}>{won(r.amount)}</span>}
                    <span className={styles.muted}>{r.ownerName ?? t('crm.unassigned')}</span>
                  </div>
                </div>
              ),
            }),
          ),
      }));
  const [cols, setCols] = useState<KanbanColumn[]>(() => make(rows));
  const key = rows.map((r) => `${r.id}:${r.stage}:${r.nextActionAt}`).join('|');
  useEffect(() => {
    setCols(make(rows));
  }, [key]);
  const onChange = (next: KanbanColumn[]) => {
    for (const col of next)
      for (const card of col.cards) {
        const l = rows.find((r) => r.id === card.id);
        if (!l || l.stage === col.id) continue;
        if (!canMove) {
          toast({ type: 'error', title: t('crm.noStagePerm') });
          setCols(make(rows));
          return;
        }
        onMove(l, col.id);
      }
    setCols(next);
  };
  return (
    <>
      <div className="dt-wrap">{toolbar}</div>
      {loading && !rows.length ? (
        <div className={styles.empty}>{t('crm.loading')}</div>
      ) : (
        <div className={`task-kanban ${styles.kanbanWrap}`}>
          <KanbanBoard
            columns={cols}
            onChange={onChange}
            onCardClick={(card) => onOpen(card.id)}
            showAddButton={false}
            columnMinWidth={220}
          />
        </div>
      )}
    </>
  );
}

const ACT_KINDS: Exclude<CrmActivityKind, 'STAGE'>[] = ['CALL', 'SMS', 'EMAIL', 'MEETING', 'MEMO'];
const ACT_ICON = { CALL: Phone, SMS: MessageSquare, EMAIL: Mail, MEETING: Users, MEMO: StickyNote };

function LeadDetail({
  def,
  id,
  canEdit,
  canDelete,
  onBack,
  onEdit,
  onChanged,
}: {
  def: CrmPipelineDef;
  id: string;
  canEdit: boolean;
  canDelete: boolean;
  onBack: () => void;
  onEdit: (l: CrmLeadView) => void;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const base = `/crm/${def.key}/leads`;
  const [d, setD] = useState<{
    lead: CrmLeadView;
    activities: CrmActivityView[];
  } | null>(null);
  const [kind, setKind] = useState<(typeof ACT_KINDS)[number]>('CALL');
  const [content, setContent] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [nextWhat, setNextWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setD(await api(`${base}/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.loadFailed') });
    }
  }, [base, id, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const addActivity = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api(`${base}/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          kind,
          content,
          ...(nextAt ? { nextActionAt: nextAt, nextAction: nextWhat || null } : {}),
        }),
      });
      setContent('');
      setNextAt('');
      setNextWhat('');
      await load();
      await onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.logFailed') });
    } finally {
      setBusy(false);
    }
  };
  const stage = async (s: string) => {
    try {
      await api(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify({ stage: s }) });
      await load();
      await onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.changeFailed') });
    }
  };
  const remove = async () => {
    if (!d || !window.confirm(t('crm.deleteQ', { v0: d.lead.companyName }))) return;
    try {
      await api(`${base}/${id}`, { method: 'DELETE' });
      await onChanged();
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.deleteFailed') });
    }
  };

  const l = d?.lead;
  return (
    <RecordDetail
      loading={!d}
      title={l?.companyName ?? ''}
      backLabel={def.label}
      onBack={onBack}
      actions={
        l ? (
          <>
            {canDelete && (
              <Button variant="ghost" size="sm" onClick={() => void remove()}>
                {t('crm.delete')}
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(l)}>
                {t('crm.edit')}
              </Button>
            )}
          </>
        ) : undefined
      }
      sections={
        l
          ? [
              {
                title: t('crm.basic'),
                items: [
                  { label: 'ID', value: l.code },
                  { label: t('crm.createdAt'), value: l.createdAt.slice(0, 10) },
                  {
                    label: def.key === 'B2B' ? t('crm.col.company') : t('crm.col.business'),
                    value: l.companyName,
                  },
                  { label: t('crm.f.stage'), value: <StageBadge def={def} stage={l.stage} /> },
                  { label: def.regionLabel, value: l.region },
                  { label: t('crm.f.source'), value: sourceLabel(def, l.source) },
                  ...def.fields.map((f) => ({
                    label: f.label,
                    value: fieldText(f, l.fields?.[f.key]),
                    wide: f.type === 'textarea',
                  })),
                ],
              },
              {
                title: t('crm.contactInfo'),
                items: [
                  {
                    label: def.contactLabel,
                    value: [l.contactName, l.contactTitle].filter(Boolean).join(' · ') || null,
                  },
                  { label: t('crm.f.phone'), value: l.phone ? formatPhone(l.phone) : null },
                  ...(def.key === 'B2B' ? [{ label: t('crm.f.email'), value: l.email }] : []),
                ],
              },
              {
                title: t('crm.salesInfo'),
                items: [
                  { label: t('crm.f.owner'), value: l.ownerName },
                  { label: t('crm.f.interest'), value: CRM_INTEREST_LABEL[l.interest] },
                  ...(def.amountLabel
                    ? [{ label: def.amountLabel, value: l.amount == null ? null : won(l.amount) }]
                    : []),
                  ...(def.expectedLabel ? [{ label: def.expectedLabel, value: l.expectedAt }] : []),
                  {
                    label: t('crm.col.lastContact'),
                    value: l.lastActivityAt ? l.lastActivityAt.slice(0, 10) : null,
                  },
                  { label: t('crm.col.next'), value: <NextAction l={l} /> },
                  { label: t('crm.f.nextAction'), value: l.nextAction },
                  ...(def.link ? [{ label: def.linkLabel, value: l.linkName }] : []),
                  { label: t('crm.f.lostReason'), value: l.lostReason },
                  { label: t('crm.f.memo'), value: l.memo, wide: true },
                ],
              },
            ]
          : []
      }
    >
      {l && (
        <>
          {canEdit && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>{t('crm.f.stage')}</h3>
              <SegmentedControl
                value={l.stage}
                onChange={(v) => v !== l.stage && void stage(v)}
                options={def.stages.map((s) => ({ value: s.key, label: s.label }))}
              />
            </section>
          )}
          <section className={styles.block}>
            <h3 className={styles.blockTitle}>{t('crm.activities')}</h3>
            {canEdit && (
              <div className={styles.actForm}>
                <div className="form-chips" role="radiogroup" aria-label={t('crm.activityKind')}>
                  {ACT_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      className={`form-chip${kind === k ? ' form-chip-on' : ''}`}
                      onClick={() => setKind(k)}
                    >
                      {CRM_ACTIVITY_LABEL[k]}
                    </button>
                  ))}
                </div>
                <Textarea
                  rows={3}
                  value={content}
                  maxLength={3000}
                  placeholder={t('crm.activityPh')}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className={styles.actNext}>
                  <span className={styles.muted}>{t('crm.col.next')}</span>
                  <Input type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
                  <Input
                    value={nextWhat}
                    placeholder={t('crm.nextActionOpt')}
                    maxLength={200}
                    onChange={(e) => setNextWhat(e.target.value)}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy}
                    disabled={!content.trim()}
                    onClick={() => void addActivity()}
                  >
                    {t('crm.logBtn')}
                  </Button>
                </div>
              </div>
            )}
            {d.activities.length ? (
              <ol className={styles.timeline}>
                {d.activities.map((a) => {
                  const Icon = a.kind === 'STAGE' ? null : ACT_ICON[a.kind];
                  return (
                    <li key={a.id}>
                      <span className={styles.tlIcon}>{Icon ? <Icon size={12} /> : '•'}</span>
                      <div className={styles.tlBody}>
                        <span>
                          <b>{a.actorName ?? t('crm.unknown')}</b> ·{' '}
                          {a.kind === 'STAGE' ? (
                            <>
                              {t('crm.f.stage')}{' '}
                              {a.fromStage ? `${stageLabel(def, a.fromStage)} → ` : ''}
                              <b>{stageLabel(def, a.toStage)}</b>
                            </>
                          ) : (
                            <Badge variant="subtle" size="sm">
                              {CRM_ACTIVITY_LABEL[a.kind]}
                            </Badge>
                          )}
                        </span>
                        {a.content && <span className={styles.tlNote}>{a.content}</span>}
                        <time className={styles.muted}>{when(a.at)}</time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={styles.muted}>{t('crm.noActivities')}</p>
            )}
          </section>
        </>
      )}
    </RecordDetail>
  );
}

const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error(i18n.t('crm.fileFailed')));
    r.readAsDataURL(f);
  });

const IMPORT_STATUS: Record<CrmImportPreview['rows'][number]['status'], string> = {
  create: i18n.t('crm.imp.create'),
  duplicate: i18n.t('crm.imp.duplicate'),
  invalid: i18n.t('crm.imp.invalid'),
};

/**
 * 가져오기 — 엑셀·구글 시트에서 표를 복사해 붙여넣거나 CSV·xlsx 파일을 고른다.
 * 머리글(업체명·대표자·연락처·지역·진행상태·관심도·담당자 …)로 항목을 맞춰 미리 보여 주고, 확인하면 넣는다.
 */
function ImportModal({
  def,
  onClose,
  onDone,
}: {
  def: CrmPipelineDef;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CrmImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await api<CrmImportPreview>(`/crm/${def.key}/import`, {
        method: 'POST',
        body: JSON.stringify({
          dryRun,
          ...(file ? { file: { name: file.name, dataBase64: await readBase64(file) } } : { text }),
        }),
      });
      if (dryRun) setPreview(r);
      else {
        toast({ type: 'success', title: t('crm.imported', { v0: r.imported ?? 0 }) });
        onDone();
      }
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('crm.importFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('crm.importTitle', { v0: def.label })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('crm.cancel')}
          </Button>
          {preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)}>
                {t('crm.repick')}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!preview.create}
                onClick={() => void send(false)}
              >
                {preview.create}
                {t('crm.importN')}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              loading={busy}
              disabled={!file && !text.trim()}
              onClick={() => void send(true)}
            >
              {t('crm.preview')}
            </Button>
          )}
        </>
      }
    >
      {!preview ? (
        <div className={styles.importForm}>
          <p className={styles.muted}>
            {t('crm.importHelp1')}
            {t('crm.importHelp2')}
            {t('crm.importHelp3')}
          </p>
          <Textarea
            rows={10}
            value={text}
            disabled={!!file}
            placeholder={
              '업체명\t대표자\t연락처\t지역\t진행상태\n○○익스프레스\t홍길동\t010-1234-5678\t수원\t상담대기'
            }
            onChange={(e) => setText(e.target.value)}
          />
          <div className={styles.importFile}>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {t('crm.pickFile')}
            </Button>
            {file ? (
              <span>
                {file.name}{' '}
                <button type="button" className={styles.linkBtn} onClick={() => setFile(null)}>
                  {t('crm.remove')}
                </button>
              </span>
            ) : (
              <span className={styles.muted}>CSV · xlsx</span>
            )}
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".csv,.tsv,.txt,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      ) : (
        <div className={styles.importForm}>
          <div className={styles.importCounts}>
            <span>
              {t('crm.scope.all')} <b>{preview.total}</b>
            </span>
            <span className={styles.ok}>
              {t('crm.imp.create')} <b>{preview.create}</b>
            </span>
            <span>
              {t('crm.imp.duplicate')} <b>{preview.duplicate}</b>
            </span>
            {preview.invalid > 0 && (
              <span className={styles.over}>
                {t('crm.imp.invalid')} <b>{preview.invalid}</b>
              </span>
            )}
          </div>
          <div className={styles.importCols}>
            {preview.columns.map((c, i) => (
              <span key={i} className={c.field ? styles.colOn : styles.colOff}>
                {c.header}
                {c.label && c.label !== c.header ? ` → ${c.label}` : ''}
              </span>
            ))}
          </div>
          {preview.warnings.map((w) => (
            <p key={w} className={styles.warn}>
              {w}
            </p>
          ))}
          <div className={styles.importTable}>
            <table>
              <thead>
                <tr>
                  <th>{t('crm.result')}</th>
                  <th>{def.companyLabel.replace(/\(.*\)/, '')}</th>
                  <th>{def.contactLabel.replace(/\(.*\)/, '')}</th>
                  <th>{t('crm.f.phone')}</th>
                  <th>{t('crm.col.region')}</th>
                  <th>{t('crm.f.stage')}</th>
                  <th>{t('crm.f.interest')}</th>
                  <th>{t('crm.f.owner')}</th>
                  <th>{t('crm.createdAt')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className={r.status === 'create' ? '' : styles.rowDim}>
                    <td>{IMPORT_STATUS[r.status]}</td>
                    <td>{r.companyName}</td>
                    <td>{r.contactName ?? '—'}</td>
                    <td>{r.phone ? formatPhone(r.phone) : '—'}</td>
                    <td>{r.region ?? '—'}</td>
                    <td>{r.stage}</td>
                    <td>{CRM_INTEREST_LABEL[r.interest as CrmInterest]}</td>
                    <td>{r.ownerName ?? '—'}</td>
                    <td>{r.createdAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
