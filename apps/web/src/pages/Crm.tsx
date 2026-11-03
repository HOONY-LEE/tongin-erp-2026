import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Mail, MessageSquare, Phone, Search, StickyNote, Users } from 'lucide-react';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '@sunghoon_lee/akron-ui';
import {
  CRM_ACTIVITY_LABEL,
  CRM_INTERESTS,
  CRM_INTEREST_LABEL,
  CRM_PHASES,
  CRM_PIPELINES,
  crmPhaseOf,
  type CrmPhase,
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
  Input,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import styles from './franchise.module.css';

type View = 'board' | 'list';
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 목록·카드용 짧은 금액 — 7.5억 · 3,000만 */
const wonShort = (n: number) =>
  n >= 1e8
    ? `${(n / 1e8).toFixed(n % 1e8 ? 1 : 0).replace(/\.0$/, '')}억`
    : n >= 1e4
      ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`
      : `${n.toLocaleString('ko-KR')}원`;
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
/** 목록용 짧은 날짜 — 올해면 11.01, 아니면 25.11.01 */
const shortYmd = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const [y, m, dd] = d.split('-');
  return y === kstToday().slice(0, 4) ? `${m}.${dd}` : `${y.slice(2)}.${m}.${dd}`;
};
const md = (s: string) => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

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
  if (!l.nextActionAt) return <span className={styles.muted}>—</span>;
  const t = kstToday();
  const cls = l.nextActionAt < t ? styles.over : l.nextActionAt === t ? styles.soon : '';
  return (
    <span className={cls} title={l.nextAction ?? undefined}>
      {l.nextActionAt}
      {l.nextActionAt < t ? ' (지남)' : l.nextActionAt === t ? ' (오늘)' : ''}
    </span>
  );
}

/**
 * 영업 CRM 공통 화면 — 가맹 영업(/franchise-leads) · 기업영업(/b2b-crm).
 * 단계·유입 경로·추가 항목·금액 이름은 CRM_PIPELINES 설정에서 오고 화면 코드는 하나다.
 * 칸반·목록, 상담 기록(통화·문자·메일·미팅·메모), 다음 연락일
 */
export default function Crm({ pipeline }: { pipeline: CrmPipelineKey }) {
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
  const t = kstToday();
  const weekLater = new Date(Date.parse(`${t}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const open = rows.filter((r) => OPEN.includes(r.stage));
  const dueSoon = open.filter((r) => r.nextActionAt && r.nextActionAt <= weekLater).length;

  const changeStage = async (l: CrmLeadView, stage: string) => {
    try {
      await api(`${base}/${l.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) });
      toast({ type: 'success', title: `${stageLabel(def, stage)}(으)로 옮겼습니다` });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '바꾸지 못했습니다' });
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
            label: '직함·부서',
            placeholder: '예: 총무팀 과장',
            alwaysShow: true,
          },
        ]
      : []),
    {
      name: 'phone',
      label: '연락처',
      type: 'tel',
      alwaysShow: true,
      pairWithNext: pipeline === 'B2B',
    },
    ...(pipeline === 'B2B' ? [{ name: 'email', label: '메일', alwaysShow: true }] : []),
    {
      name: 'region',
      label: def.regionLabel,
      placeholder: '예: 경기 성남 분당',
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'source',
      label: '유입 경로',
      type: 'select',
      options: def.sources.map((v) => ({ value: v.key, label: v.label })),
      alwaysShow: true,
    },
    {
      name: 'stage',
      label: '단계',
      type: 'chips',
      options: def.stages.map((v) => ({ value: v.key, label: v.label })),
      alwaysShow: true,
    },
    {
      name: 'interest',
      label: '관심도',
      type: 'chips',
      options: CRM_INTERESTS.map((v) => ({ value: v, label: CRM_INTEREST_LABEL[v] })),
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'ownerEmpId',
      label: '영업 담당',
      type: 'select',
      options: personOptions,
      searchable: true,
      alwaysShow: true,
    },
    ...(def.amountLabel
      ? [
          {
            name: 'amount',
            label: `${def.amountLabel}(원)`,
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
      label: '다음 연락일',
      type: 'date',
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'nextAction',
      label: '다음에 할 일',
      placeholder: '예: 설명 자료 보내기',
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
    { name: 'memo', label: '메모', type: 'textarea' },
    { name: 'lostReason', label: '실패·보류 이유' },
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
      toast({ type: 'success', title: isNew ? '영업 대상을 등록했습니다' : '저장했습니다' });
      setEditing(null);
      await load();
      if (isNew && res.id) detail.open(res.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
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
      title={editing === 'new' ? `${def.label} 대상 등록` : '영업 대상 수정'}
      size="md"
      fields={fields}
      initialValues={editing ? initialOf(editing) : undefined}
      onSubmit={save}
    />
  );
  const addButton = can(`${def.perm}.CREATE`) ? (
    <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
      + 영업 대상 등록
    </Button>
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
        { value: 'list', label: '리스트' },
        { value: 'board', label: '칸반' },
      ]}
    />
  );
  const filters = (
    <SegmentedControl
      value={mineOnly ? 'mine' : 'all'}
      onChange={(v) => setMineOnly(v === 'mine')}
      options={[
        { value: 'all', label: '전체' },
        { value: 'mine', label: '내 담당' },
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
        placeholder="상호·이름·지역·연락처"
        aria-label="영업 대상 찾기"
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
  const amountName = def.amountLabel?.replace(/\(.*\)/, '') ?? '금액';
  const kpis: { label: string; value: string; sub?: string }[] =
    phase === 'lead' || phase === 'all'
      ? [
          {
            label: `${def.phaseLabels.lead} 수`,
            value: `${inPhase.length}`,
            sub: `일주일 안 연락할 곳 ${dueSoon}`,
          },
          ...(def.amountLabel
            ? [{ label: `${def.phaseLabels.lead} ${amountName}`, value: won(sum(inPhase)) }]
            : []),
          {
            label: '관심도 높음',
            value: inPhase.length
              ? `${Math.round((inPhase.filter((r) => r.interest === 'A').length / inPhase.length) * 100)}%`
              : '—',
            sub: `${inPhase.filter((r) => r.interest === 'A').length}곳`,
          },
        ]
      : phase === 'deal'
        ? [
            {
              label: `${def.phaseLabels.deal} 건수`,
              value: `${inPhase.length}`,
              sub: `일주일 안 연락할 곳 ${dueSoon}`,
            },
            ...(def.amountLabel ? [{ label: '파이프라인 가치', value: won(sum(inPhase)) }] : []),
            {
              label: '전환율',
              value: wonN + lostN ? `${Math.round((wonN / (wonN + lostN)) * 100)}%` : '—',
              sub: `${def.phaseLabels.won} ${wonN} · 실패 ${lostN}`,
            },
          ]
        : phase === 'won'
          ? [
              { label: `${def.phaseLabels.won} 건수`, value: `${inPhase.length}` },
              ...(def.amountLabel
                ? [
                    { label: `총 ${amountName}`, value: won(sum(inPhase)) },
                    {
                      label: `평균 ${amountName}`,
                      value: inPhase.length ? won(Math.round(sum(inPhase) / inPhase.length)) : '—',
                    },
                  ]
                : []),
            ]
          : [
              { label: '보류', value: `${holdN}` },
              { label: '실패', value: `${lostN}` },
            ];

  const columns: Column[] = [
    {
      title: 'ID',
      width: 92,
      render: (r) => <span className={styles.code}>{(r as unknown as CrmLeadView).code}</span>,
      exportValue: (r) => (r as unknown as CrmLeadView).code,
    },
    {
      title: '고객명',
      width: 80,
      render: (r) => (r.contactName as string) ?? '—',
      exportValue: (r) => (r.contactName as string) ?? '',
    },
    {
      title: pipeline === 'B2B' ? '회사명' : '상호',
      dataIndex: 'companyName',
      flex: 1,
      minWidth: 140,
    },
    {
      title: '연락처',
      width: 142,
      render: (r) => (r.phone ? formatPhone(String(r.phone)) : '—'),
      exportValue: (r) => (r.phone ? formatPhone(String(r.phone)) : ''),
    },
    // 유입 경로는 리드 단계에서 주로 본다 — 진행·계약 탭은 금액·다음 연락을 보이려고 뺀다
    ...(phase === 'lead' || phase === 'all'
      ? [{ title: '유입경로', width: 96, render: (r: Row) => sourceLabel(def, String(r.source)) }]
      : []),
    ...(phase === 'lead' || phase === 'all'
      ? [
          {
            title: '지역',
            width: 100,
            render: (r: Row) => (r.region as string) ?? '—',
            exportValue: (r: Row) => (r.region as string) ?? '',
          },
        ]
      : []),
    {
      title: '단계',
      width: 100,
      render: (r) => <StageBadge def={def} stage={String(r.stage)} />,
      exportValue: (r) => stageLabel(def, String(r.stage)),
    },
    {
      title: '영업 담당',
      width: 80,
      render: (r) =>
        r.ownerName ? <span className={styles.personChip}>{r.ownerName as string}</span> : '—',
      exportValue: (r) => (r.ownerName as string) ?? '',
    },
    {
      title: '마지막 접촉',
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
            title: def.link === 'BRANCH' ? '가맹점' : '거래처',
            width: 100,
            render: (r: Row) => (r.linkName as string) ?? '—',
            exportValue: (r: Row) => (r.linkName as string) ?? '',
          },
        ]
      : [
          {
            title: '다음 연락',
            width: 110,
            render: (r: Row) => <NextAction l={r as unknown as CrmLeadView} />,
            exportValue: (r: Row) => (r.nextActionAt as string) ?? '',
          },
        ]),
    {
      title: '관심도',
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
        { value: 'all', label: '전체' },
      ]}
    />
  );

  return (
    <ListPage
      fit
      title={def.label}
      subtitle={`${def.description} 상세에서 통화·문자·미팅 기록을 남기고, 칸반에서는 카드를 끌어 단계를 옮깁니다.`}
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
            exportFileName={`${def.label.replace(/\s/g, '')}_${phase === 'all' ? '전체' : def.phaseLabels[phase]}`}
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
  const toast = useToast();
  const t = kstToday();
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
                        r.nextActionAt && r.nextActionAt < t
                          ? styles.over
                          : r.nextActionAt === t
                            ? styles.soon
                            : styles.muted
                      }
                    >
                      <CalendarClock size={11} aria-hidden /> 다음 연락{' '}
                      {r.nextActionAt ? md(r.nextActionAt) : '—'}
                    </span>
                    {r.amount != null && <span className={styles.muted}>{won(r.amount)}</span>}
                    <span className={styles.muted}>{r.ownerName ?? '담당 없음'}</span>
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
          toast({ type: 'error', title: '단계를 바꿀 권한이 없습니다' });
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
        <div className={styles.empty}>불러오는 중…</div>
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '남기지 못했습니다' });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '바꾸지 못했습니다' });
    }
  };
  const remove = async () => {
    if (
      !d ||
      !window.confirm(`'${d.lead.companyName}'을(를) 지울까요? 상담 기록도 함께 지워집니다.`)
    )
      return;
    try {
      await api(`${base}/${id}`, { method: 'DELETE' });
      await onChanged();
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
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
                삭제
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(l)}>
                수정
              </Button>
            )}
          </>
        ) : undefined
      }
      sections={
        l
          ? [
              {
                title: '기본 정보',
                items: [
                  { label: 'ID', value: l.code },
                  { label: '등록일', value: l.createdAt.slice(0, 10) },
                  { label: def.key === 'B2B' ? '회사명' : '상호', value: l.companyName },
                  { label: '단계', value: <StageBadge def={def} stage={l.stage} /> },
                  { label: def.regionLabel, value: l.region },
                  { label: '유입 경로', value: sourceLabel(def, l.source) },
                  ...def.fields.map((f) => ({
                    label: f.label,
                    value: fieldText(f, l.fields?.[f.key]),
                    wide: f.type === 'textarea',
                  })),
                ],
              },
              {
                title: '연락처 정보',
                items: [
                  {
                    label: def.contactLabel,
                    value: [l.contactName, l.contactTitle].filter(Boolean).join(' · ') || null,
                  },
                  { label: '연락처', value: l.phone ? formatPhone(l.phone) : null },
                  ...(def.key === 'B2B' ? [{ label: '메일', value: l.email }] : []),
                ],
              },
              {
                title: '영업 정보',
                items: [
                  { label: '영업 담당', value: l.ownerName },
                  { label: '관심도', value: CRM_INTEREST_LABEL[l.interest] },
                  ...(def.amountLabel
                    ? [{ label: def.amountLabel, value: l.amount == null ? null : won(l.amount) }]
                    : []),
                  ...(def.expectedLabel ? [{ label: def.expectedLabel, value: l.expectedAt }] : []),
                  {
                    label: '마지막 접촉',
                    value: l.lastActivityAt ? l.lastActivityAt.slice(0, 10) : null,
                  },
                  { label: '다음 연락', value: <NextAction l={l} /> },
                  { label: '다음에 할 일', value: l.nextAction },
                  ...(def.link ? [{ label: def.linkLabel, value: l.linkName }] : []),
                  { label: '실패·보류 이유', value: l.lostReason },
                  { label: '메모', value: l.memo, wide: true },
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
              <h3 className={styles.blockTitle}>단계</h3>
              <SegmentedControl
                value={l.stage}
                onChange={(v) => v !== l.stage && void stage(v)}
                options={def.stages.map((s) => ({ value: s.key, label: s.label }))}
              />
            </section>
          )}
          <section className={styles.block}>
            <h3 className={styles.blockTitle}>상담 기록</h3>
            {canEdit && (
              <div className={styles.actForm}>
                <div className="form-chips" role="radiogroup" aria-label="기록 종류">
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
                  placeholder="상담 내용 — 예: 조건 문의, 다음 주 방문 희망"
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className={styles.actNext}>
                  <span className={styles.muted}>다음 연락</span>
                  <Input type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
                  <Input
                    value={nextWhat}
                    placeholder="다음에 할 일(선택)"
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
                    기록 남기기
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
                          <b>{a.actorName ?? '알 수 없음'}</b> ·{' '}
                          {a.kind === 'STAGE' ? (
                            <>
                              단계 {a.fromStage ? `${stageLabel(def, a.fromStage)} → ` : ''}
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
              <p className={styles.muted}>아직 상담 기록이 없습니다.</p>
            )}
          </section>
        </>
      )}
    </RecordDetail>
  );
}
