import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, MessageSquare, Phone, Search, StickyNote, Users } from 'lucide-react';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '@sunghoon_lee/akron-ui';
import {
  FRANCHISE_ACTIVITY_LABEL,
  FRANCHISE_INTERESTS,
  FRANCHISE_INTEREST_LABEL,
  FRANCHISE_LEAD_SOURCES,
  FRANCHISE_LEAD_SOURCE_LABEL,
  FRANCHISE_LEAD_STAGES,
  FRANCHISE_LEAD_STAGE_COLOR,
  FRANCHISE_LEAD_STAGE_LABEL,
  FRANCHISE_PIPELINE,
  type FranchiseActivityKind,
  type FranchiseActivityView,
  type FranchiseLeadStage,
  type FranchiseLeadView,
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
type ListTab = 'open' | 'WON' | 'HOLD' | 'LOST' | 'all';
const OPEN: FranchiseLeadStage[] = ['NEW', 'CONTACTED', 'CONSULTING', 'MEETING', 'CONTRACTING'];
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const md = (s: string) => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

function StageBadge({ stage }: { stage: FranchiseLeadStage }) {
  return (
    <span className={styles.stage}>
      <i style={{ background: FRANCHISE_LEAD_STAGE_COLOR[stage] }} />
      {FRANCHISE_LEAD_STAGE_LABEL[stage]}
    </span>
  );
}

function NextAction({ l }: { l: FranchiseLeadView }) {
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
 * 가맹 영업 — 가맹점 모집 CRM(이사 고객 CRM인 '접수'와 따로).
 * 발굴 → 첫 연락 → 상담 → 미팅·방문 → 계약 진행 → 계약 완료(보류·실패). 칸반·목록, 상담 기록(통화·문자·미팅·메모), 다음 연락일
 */
export default function FranchiseLeads() {
  const toast = useToast();
  const { user, can } = useAuth();
  const { people } = useDirectory();
  const [rows, setRows] = useState<FranchiseLeadView[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [editing, setEditing] = useState<FranchiseLeadView | 'new' | null>(null);
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const { tab: view, setTab: setView } = useTabParam<View>('board', 'view');
  const { tab: listTab, setTab: setListTab } = useTabParam<ListTab>('open');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<FranchiseLeadView[]>('/franchise/leads'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast, touch]);
  useEffect(() => {
    void load();
    void api<{ rows: { orgUnitId: string; name: string }[] }>('/franchise/branches')
      .then((r) => setBranches(r.rows.map((b) => ({ value: b.orgUnitId, label: b.name }))))
      .catch(() => undefined);
  }, [load]);

  const term = q.trim();
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mineOnly || r.ownerEmpId === user?.employeeId) &&
          (!term ||
            [r.companyName, r.contactName, r.region, r.ownerName, r.memo].some((x) =>
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

  const changeStage = async (l: FranchiseLeadView, stage: FranchiseLeadStage) => {
    try {
      await api(`/franchise/leads/${l.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) });
      toast({ type: 'success', title: `${FRANCHISE_LEAD_STAGE_LABEL[stage]}(으)로 옮겼습니다` });
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
    { name: 'companyName', label: '상호(또는 이름)', required: true },
    { name: 'contactName', label: '담당자(사장님)', alwaysShow: true, pairWithNext: true },
    { name: 'phone', label: '연락처', type: 'tel', alwaysShow: true },
    {
      name: 'region',
      label: '희망·운영 지역',
      placeholder: '예: 경기 성남 분당',
      alwaysShow: true,
      pairWithNext: true,
    },
    {
      name: 'source',
      label: '유입 경로',
      type: 'select',
      options: FRANCHISE_LEAD_SOURCES.map((v) => ({
        value: v,
        label: FRANCHISE_LEAD_SOURCE_LABEL[v],
      })),
      alwaysShow: true,
    },
    {
      name: 'stage',
      label: '단계',
      type: 'chips',
      options: FRANCHISE_LEAD_STAGES.map((v) => ({
        value: v,
        label: FRANCHISE_LEAD_STAGE_LABEL[v],
      })),
      alwaysShow: true,
    },
    {
      name: 'interest',
      label: '관심도',
      type: 'chips',
      options: FRANCHISE_INTERESTS.map((v) => ({ value: v, label: FRANCHISE_INTEREST_LABEL[v] })),
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
      placeholder: '예: 가맹 설명 자료 보내기',
      alwaysShow: true,
    },
    { name: 'currentBiz', label: '지금 하는 사업', placeholder: '예: 개인 이사업체 5년, 차량 2대' },
    { name: 'memo', label: '메모', type: 'textarea' },
    { name: 'lostReason', label: '실패·보류 이유' },
    {
      name: 'branchId',
      label: '계약 후 연결된 가맹점',
      type: 'select',
      options: branches,
      searchable: true,
    },
  ];
  const save = async (v: Record<string, unknown>) => {
    const isNew = editing === 'new';
    const str = (k: string) => (v[k] === '' || v[k] == null ? null : String(v[k]));
    const body = {
      companyName: String(v.companyName ?? '').trim(),
      contactName: str('contactName'),
      phone: str('phone'),
      region: str('region'),
      source: v.source || 'DB',
      stage: v.stage || 'NEW',
      interest: v.interest || 'B',
      ownerEmpId: str('ownerEmpId'),
      nextActionAt: str('nextActionAt'),
      nextAction: str('nextAction'),
      currentBiz: str('currentBiz'),
      memo: str('memo'),
      lostReason: str('lostReason'),
      branchId: str('branchId'),
    };
    try {
      const res = await api<{ id?: string }>(
        isNew ? '/franchise/leads' : `/franchise/leads/${(editing as FranchiseLeadView).id}`,
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
  const initialOf = (l: FranchiseLeadView | 'new') =>
    l === 'new'
      ? { source: 'DB', stage: 'NEW', interest: 'B', ownerEmpId: user?.employeeId ?? '' }
      : Object.fromEntries(
          Object.entries(l)
            .filter(([k, x]) => x !== null && fields.some((f) => f.name === k))
            .map(([k, x]) => [k, String(x)]),
        );
  const modal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? '가맹 영업 대상 등록' : '영업 대상 수정'}
      size="md"
      fields={fields}
      initialValues={editing ? initialOf(editing) : undefined}
      onSubmit={save}
    />
  );
  const addButton = can('FRANCHISE.CREATE') ? (
    <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
      + 영업 대상 등록
    </Button>
  ) : undefined;

  if (detail.id) {
    return (
      <>
        <LeadDetail
          id={detail.id}
          canEdit={can('FRANCHISE.UPDATE')}
          canDelete={can('FRANCHISE.DELETE')}
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
        { value: 'board', label: '칸반' },
        { value: 'list', label: '리스트' },
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

  const columns: Column[] = [
    {
      title: '단계',
      width: 110,
      render: (r) => <StageBadge stage={r.stage as FranchiseLeadStage} />,
      exportValue: (r) => FRANCHISE_LEAD_STAGE_LABEL[r.stage as FranchiseLeadStage],
    },
    { title: '상호', dataIndex: 'companyName', flex: 1, minWidth: 140 },
    {
      title: '담당자',
      dataIndex: 'contactName',
      width: 90,
      render: (r) => (r.contactName as string) ?? '—',
    },
    { title: '연락처', width: 130, render: (r) => (r.phone ? formatPhone(String(r.phone)) : '—') },
    { title: '지역', dataIndex: 'region', width: 130, render: (r) => (r.region as string) ?? '—' },
    {
      title: '경로',
      width: 110,
      render: (r) =>
        FRANCHISE_LEAD_SOURCE_LABEL[r.source as keyof typeof FRANCHISE_LEAD_SOURCE_LABEL],
    },
    {
      title: '관심도',
      width: 70,
      render: (r) => FRANCHISE_INTEREST_LABEL[r.interest as 'A' | 'B' | 'C'],
    },
    { title: '영업 담당', width: 90, render: (r) => (r.ownerName as string) ?? '—' },
    {
      title: '다음 연락',
      width: 150,
      render: (r) => <NextAction l={r as unknown as FranchiseLeadView} />,
      exportValue: (r) => (r.nextActionAt as string) ?? '',
    },
  ];
  const listRows = filtered.filter((r) =>
    listTab === 'open' ? OPEN.includes(r.stage) : listTab === 'all' ? true : r.stage === listTab,
  );

  return (
    <ListPage
      fit
      title="가맹 영업"
      subtitle="가맹점이 될 업체(사장님)를 발굴하고 상담해 계약까지 이끄는 CRM입니다. 이사 고객(접수)과 따로 관리합니다. 카드를 끌어 단계를 옮기고, 상세에서 통화·문자·미팅 기록을 남기세요."
      onRefresh={load}
      updatedAt={updatedAt}
    >
      <div className={styles.leadStats}>
        <span>
          진행 중 <b>{open.length}</b>
        </span>
        <span className={dueSoon ? styles.soon : ''}>
          일주일 안 연락할 곳 <b>{dueSoon}</b>
        </span>
        <span>
          계약 완료 <b>{rows.filter((r) => r.stage === 'WON').length}</b>
        </span>
        <span>
          보류·실패 <b>{rows.filter((r) => r.stage === 'HOLD' || r.stage === 'LOST').length}</b>
        </span>
      </div>
      {view === 'list' ? (
        <DataTable
          fit
          columns={columns}
          rows={listRows as unknown as Row[]}
          loading={loading}
          exportable
          exportFileName="가맹영업"
          filters={filters}
          viewSwitch={viewSwitch}
          tabs={
            <SegmentedControl
              value={listTab}
              onChange={(v) => setListTab(v as ListTab)}
              options={[
                { value: 'open', label: '진행 중' },
                { value: 'WON', label: '계약 완료' },
                { value: 'HOLD', label: '보류' },
                { value: 'LOST', label: '실패' },
                { value: 'all', label: '전체' },
              ]}
            />
          }
          toolbarActions={addButton}
          onRowClick={(r) => detail.open(String(r.id))}
        />
      ) : (
        <Board
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
          canMove={can('FRANCHISE.UPDATE')}
          onMove={(l, s) => void changeStage(l, s)}
          onOpen={detail.open}
        />
      )}
      {modal}
    </ListPage>
  );
}

function Board({
  rows,
  loading,
  toolbar,
  canMove,
  onMove,
  onOpen,
}: {
  rows: FranchiseLeadView[];
  loading: boolean;
  toolbar: React.ReactNode;
  canMove: boolean;
  onMove: (l: FranchiseLeadView, s: FranchiseLeadStage) => void;
  onOpen: (id: string) => void;
}) {
  const toast = useToast();
  const t = kstToday();
  const make = (list: FranchiseLeadView[]): KanbanColumn[] =>
    FRANCHISE_PIPELINE.map((s) => ({
      id: s,
      title: FRANCHISE_LEAD_STAGE_LABEL[s],
      color: FRANCHISE_LEAD_STAGE_COLOR[s],
      cards: list
        .filter((r) => r.stage === s)
        .map(
          (r): KanbanCard => ({
            id: r.id,
            title: r.companyName,
            footer: (
              <div className={styles.kFooter}>
                <div className={styles.kRow}>
                  <span>{[r.contactName, r.region].filter(Boolean).join(' · ') || '—'}</span>
                  <span className={styles.kChip}>{FRANCHISE_INTEREST_LABEL[r.interest]}</span>
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
        onMove(l, col.id as FranchiseLeadStage);
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

const ACT_KINDS: Exclude<FranchiseActivityKind, 'STAGE'>[] = ['CALL', 'SMS', 'MEETING', 'MEMO'];
const ACT_ICON = { CALL: Phone, SMS: MessageSquare, MEETING: Users, MEMO: StickyNote };

function LeadDetail({
  id,
  canEdit,
  canDelete,
  onBack,
  onEdit,
  onChanged,
}: {
  id: string;
  canEdit: boolean;
  canDelete: boolean;
  onBack: () => void;
  onEdit: (l: FranchiseLeadView) => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [d, setD] = useState<{
    lead: FranchiseLeadView;
    activities: FranchiseActivityView[];
  } | null>(null);
  const [kind, setKind] = useState<(typeof ACT_KINDS)[number]>('CALL');
  const [content, setContent] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [nextWhat, setNextWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setD(await api(`/franchise/leads/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    }
  }, [id, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const addActivity = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api(`/franchise/leads/${id}/activities`, {
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
  const stage = async (s: FranchiseLeadStage) => {
    try {
      await api(`/franchise/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ stage: s }) });
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
      await api(`/franchise/leads/${id}`, { method: 'DELETE' });
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
      backLabel="가맹 영업"
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
                items: [
                  { label: '단계', value: <StageBadge stage={l.stage} /> },
                  { label: '담당자(사장님)', value: l.contactName },
                  { label: '연락처', value: l.phone ? formatPhone(l.phone) : null },
                  { label: '지역', value: l.region },
                  { label: '유입 경로', value: FRANCHISE_LEAD_SOURCE_LABEL[l.source] },
                  { label: '관심도', value: FRANCHISE_INTEREST_LABEL[l.interest] },
                  { label: '영업 담당', value: l.ownerName },
                  { label: '다음 연락', value: <NextAction l={l} /> },
                  { label: '다음에 할 일', value: l.nextAction },
                  { label: '지금 하는 사업', value: l.currentBiz, wide: true },
                  { label: '연결된 가맹점', value: l.branchName },
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
                onChange={(v) => v !== l.stage && void stage(v as FranchiseLeadStage)}
                options={FRANCHISE_LEAD_STAGES.map((s) => ({
                  value: s,
                  label: FRANCHISE_LEAD_STAGE_LABEL[s],
                }))}
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
                      {FRANCHISE_ACTIVITY_LABEL[k]}
                    </button>
                  ))}
                </div>
                <Textarea
                  rows={3}
                  value={content}
                  maxLength={3000}
                  placeholder="상담 내용 — 예: 가맹비·초도 자재 문의, 다음 주 매장 방문 희망"
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
                              단계{' '}
                              {a.fromStage ? `${FRANCHISE_LEAD_STAGE_LABEL[a.fromStage]} → ` : ''}
                              <b>{a.toStage ? FRANCHISE_LEAD_STAGE_LABEL[a.toStage] : ''}</b>
                            </>
                          ) : (
                            <Badge variant="subtle" size="sm">
                              {FRANCHISE_ACTIVITY_LABEL[a.kind]}
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
