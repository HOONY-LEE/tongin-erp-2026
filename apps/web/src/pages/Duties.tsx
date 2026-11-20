import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SearchInput } from '../components/ui/SearchInput';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import {
  DUTY_CYCLES,
  DUTY_CYCLE_LABEL,
  TASK_STATUS_LABEL,
  type DutyCycle,
  type DutyView,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDirectory } from '../lib/approvals';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  Input,
  ListToolbar,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import styles from './duties.module.css';

interface DutyOrg {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  mission: string | null;
  memberCount: number;
}
interface Overview {
  canManage: boolean;
  orgs: DutyOrg[];
  duties: DutyView[];
}
type Tab = 'org' | 'person' | 'mine';
const NONE = '__none__';

/**
 * 업무분장 — 조직마다 맡는 역할(미션)과 업무 항목·주/부 담당자·주기·쓰는 도구.
 * 조직별(표) · 사람별(카드) · 내 업무. 작업관리(칸반)를 항목에 이으면 '진행 중'이 실제로 센다.
 * 보기는 누구나, 정하기는 DUTY.MANAGE.
 */
export default function Duties() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { people } = useDirectory();
  const [params, setParams] = useSearchParams();
  const tab = (
    ['org', 'person', 'mine'].includes(params.get('tab') ?? '') ? params.get('tab') : 'org'
  ) as Tab;
  const orgParam = params.get('org');
  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<DutyView | 'new' | null>(null);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Overview>('/duties'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('duty.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, touch]);
  useEffect(() => {
    void load();
  }, [load]);

  const orgs = data?.orgs ?? [];
  const duties = data?.duties ?? [];
  const canManage = !!data?.canManage;
  // 처음 고른 조직 — 주소에 있으면 그것, 아니면 내 조직(업무분장이 있으면), 아니면 업무분장이 있는 첫 조직
  const myOrg = user?.employeeOrgUnitId ?? null;
  const orgId =
    orgParam && orgs.some((o) => o.id === orgParam)
      ? orgParam
      : (orgs.find((o) => o.id === myOrg && duties.some((d) => d.orgUnitId === o.id))?.id ??
        orgs.find((o) => duties.some((d) => d.orgUnitId === o.id))?.id ??
        orgs[0]?.id ??
        null);
  const org = orgs.find((o) => o.id === orgId) ?? null;
  const posOf = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const tabs = (
    <SegmentedControl
      value={tab}
      onChange={(v) => setParam('tab', v)}
      options={[
        { value: 'org', label: t('duty.view.org') },
        { value: 'person', label: t('duty.view.person') },
        { value: 'mine', label: t('duty.view.mine') },
      ]}
    />
  );
  const orgSelect = (
    <div style={{ width: 180 }}>
      <Select
        value={orgId ?? ''}
        onValueChange={(v) => setParam('org', v)}
        options={orgs.map((o) => ({
          value: o.id,
          label: `${o.name} (${duties.filter((d) => d.orgUnitId === o.id).length})`,
        }))}
      />
    </div>
  );
  const addButton = canManage && (
    <Button variant="primary" size="sm" onClick={() => setOpen('new')}>
      {t('duty.addBtn')}
    </Button>
  );

  const q = query.trim();
  const match = (d: DutyView) =>
    !q || [d.title, d.ownerName, d.backupName, d.tool, d.description].some((x) => x?.includes(q));

  const columns: Column[] = [
    {
      title: '#',
      width: 52,
      numeric: true,
      render: (r) =>
        duties.filter((d) => d.orgUnitId === r.orgUnitId).findIndex((d) => d.id === r.id) + 1,
    },
    { title: t('duty.col.duty'), dataIndex: 'title', flex: 1, minWidth: 220 },
    {
      title: t('duty.col.owner'),
      dataIndex: 'ownerName',
      width: 100,
      render: (r) => (r.ownerName as string) ?? '—',
    },
    {
      title: t('duty.col.backup'),
      dataIndex: 'backupName',
      width: 100,
      render: (r) => (r.backupName as string) ?? '—',
    },
    {
      title: t('duty.col.cycle'),
      width: 70,
      render: (r) => DUTY_CYCLE_LABEL[r.cycle as DutyCycle],
    },
    {
      title: t('duty.col.tools'),
      dataIndex: 'tool',
      width: 170,
      render: (r) => (r.tool as string) ?? '—',
    },
    {
      title: t('duty.col.inProgress'),
      width: 80,
      numeric: true,
      render: (r) =>
        (r.inProgress as number) > 0 ? (
          <Badge variant="subtle" color="warning" size="sm">
            {r.inProgress as number}
          </Badge>
        ) : (
          <span className={styles.muted}>—</span>
        ),
      exportValue: (r) => r.inProgress as number,
    },
  ];
  const orgColumns = columns;
  const mineColumns: Column[] = [
    columns[1],
    { title: t('duty.col.org'), dataIndex: 'orgUnitName', width: 110 },
    {
      title: t('duty.col.myRole'),
      width: 80,
      render: (r) =>
        r.ownerEmpId === user?.employeeId ? t('duty.col.owner') : t('duty.col.backup'),
    },
    ...columns.slice(4),
  ];

  // 사람별 — 업무가 있는 사람(주·부), 조직을 고르면 그 조직 업무만
  const personCards = useMemo(() => {
    const scoped = duties.filter((d) => d.orgUnitId === orgId);
    const byPerson = new Map<string, { name: string; own: DutyView[]; backup: DutyView[] }>();
    for (const d of scoped) {
      for (const [pid, name, role] of [
        [d.ownerEmpId, d.ownerName, 'own'],
        [d.backupEmpId, d.backupName, 'backup'],
      ] as const) {
        if (!pid || !name) continue;
        const v = byPerson.get(pid) ?? { name, own: [], backup: [] };
        v[role].push(d);
        byPerson.set(pid, v);
      }
    }
    const unassigned = scoped.filter((d) => !d.ownerEmpId);
    return {
      list: [...byPerson.entries()]
        .map(([id, v]) => ({ id, ...v }))
        .filter((p) => !q || p.name.includes(q) || [...p.own, ...p.backup].some(match))
        .sort(
          (a, b) =>
            (posOf.get(a.id)?.positionOrder ?? 999) - (posOf.get(b.id)?.positionOrder ?? 999) ||
            b.own.length - a.own.length,
        ),
      unassigned,
    };
  }, [duties, orgId, q, posOf]);

  return (
    <div className={`list-page ${tab === 'person' ? '' : 'fit'}`}>
      <PageHeader
        title={t('duty.title')}
        footer={tabs}
        subtitle={t('duty.titleDesc')}
        onRefresh={load}
        updatedAt={updatedAt}
      />

      {tab === 'org' ? (
        <div className={styles.orgLayout}>
          <OrgTree
            orgs={orgs}
            duties={duties}
            selected={orgId}
            onSelect={(id) => setParam('org', id)}
          />
          <div className={styles.orgMain}>
            {org && <MissionBox org={org} canManage={canManage} onSaved={load} />}
            <DataTable
              columns={orgColumns}
              rows={duties.filter((d) => d.orgUnitId === orgId).filter(match) as unknown as Row[]}
              loading={loading}
              fit
              pageSize={0}
              exportable
              exportFileName={t('duty.exportName', { v0: org?.name ?? '' })}
              toolbarActions={addButton}
              onRowClick={(r) => setOpen(r as unknown as DutyView)}
            />
          </div>
        </div>
      ) : tab === 'person' ? (
        <>
          <div className="dt-wrap">
            <ListToolbar
              search={
                <SearchInput value={query} onChange={setQuery} placeholder={t('duty.search')} />
              }
              filters={orgSelect}
              actions={addButton}
            />
          </div>
          <div className={styles.personGrid}>
            {personCards.list.map((p) => (
              <section key={p.id} className={styles.personCard}>
                <header className={styles.personHead}>
                  <span>
                    <b className={styles.personName}>{p.name}</b>
                    <span className={styles.muted}> {posOf.get(p.id)?.positionName ?? ''}</span>
                  </span>
                  <span className={styles.personCount}>
                    {t('duty.col.duty')} {p.own.length + p.backup.length}
                    {t('duty.countSuffix')}
                    {p.backup.length > 0 && (
                      <span className={styles.muted}>
                        {' '}
                        {t('duty.primaryOpen')} {p.own.length} {t('duty.backupSep')}{' '}
                        {p.backup.length})
                      </span>
                    )}
                  </span>
                </header>
                <ul className={styles.personList}>
                  {[...p.own, ...p.backup].map((d) => (
                    <li key={d.id}>
                      <button type="button" onClick={() => setOpen(d)}>
                        {p.backup.includes(d) && (
                          <Badge variant="subtle" color="neutral" size="sm">
                            {t('duty.backup')}
                          </Badge>
                        )}
                        <span className={styles.personDuty}>{d.title}</span>
                        <span className={styles.muted}>{DUTY_CYCLE_LABEL[d.cycle]}</span>
                        {d.inProgress > 0 && (
                          <Badge variant="subtle" color="warning" size="sm">
                            {t('duty.progress')} {d.inProgress}
                          </Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {personCards.unassigned.length > 0 && !q && (
              <section className={`${styles.personCard} ${styles.unassigned}`}>
                <header className={styles.personHead}>
                  <b className={styles.personName}>{t('duty.noOwner')}</b>
                  <span className={styles.personCount}>
                    {personCards.unassigned.length}
                    {t('duty.countSuffix')}
                  </span>
                </header>
                <ul className={styles.personList}>
                  {personCards.unassigned.map((d) => (
                    <li key={d.id}>
                      <button type="button" onClick={() => setOpen(d)}>
                        <span className={styles.personDuty}>{d.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!personCards.list.length && !personCards.unassigned.length && !loading && (
              <div className={styles.empty}>
                {t('duty.empty')}
                {canManage ? t('duty.emptyHint') : '.'}
              </div>
            )}
          </div>
        </>
      ) : (
        <DataTable
          columns={mineColumns}
          rows={
            duties
              .filter(
                (d) => d.ownerEmpId === user?.employeeId || d.backupEmpId === user?.employeeId,
              )
              .filter(match) as unknown as Row[]
          }
          loading={loading}
          fit
          pageSize={0}
          exportable
          exportFileName={t('duty.exportMine')}
          onRowClick={(r) => setOpen(r as unknown as DutyView)}
        />
      )}

      {open && (
        <DutyModal
          duty={open === 'new' ? null : open}
          orgs={orgs}
          defaultOrgId={orgId}
          canManage={canManage}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/**
 * 조직도(나무) — 그룹 → 법인 → 부서·TF, 지점은 상위 조직 밑 'N곳'으로 접어 둔다.
 * 조직 옆 숫자 = 정해 둔 업무분장 수. 누르면 오른쪽에 그 조직 역할·업무
 */
function OrgTree({
  orgs,
  duties,
  selected,
  onSelect,
}: {
  orgs: DutyOrg[];
  duties: DutyView[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [openBranches, setOpenBranches] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of duties) m.set(d.orgUnitId, (m.get(d.orgUnitId) ?? 0) + 1);
    return m;
  }, [duties]);
  const ids = new Set(orgs.map((o) => o.id));
  const kids = (id: string | null) =>
    orgs.filter((o) => (id === null ? !o.parentId || !ids.has(o.parentId) : o.parentId === id));
  // 고른 조직이 접힌 지점 묶음 안에 있으면 펼쳐 둔다
  const selOrg = orgs.find((o) => o.id === selected);
  const branchOpen = (parent: string) =>
    openBranches.has(parent) || (selOrg?.type === 'BRANCH' && selOrg.parentId === parent);

  const item = (o: DutyOrg, depth: number) => {
    const children = kids(o.id);
    const hq = children.filter((c) => c.type !== 'BRANCH');
    const branches = children.filter((c) => c.type === 'BRANCH');
    const hasKids = hq.length + branches.length > 0;
    const isOpen = !closed.has(o.id);
    return (
      <li key={o.id}>
        <div className={styles.treeRow} style={{ paddingLeft: 6 + depth * 14 }}>
          <button
            type="button"
            className={`${styles.treeToggle} ${hasKids ? '' : styles.treeToggleHidden}`}
            aria-label={isOpen ? t('duty.collapse') : t('duty.expand')}
            onClick={() =>
              setClosed((s) => {
                const n = new Set(s);
                if (n.has(o.id)) n.delete(o.id);
                else n.add(o.id);
                return n;
              })
            }
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <button
            type="button"
            className={`${styles.treeItem} ${selected === o.id ? styles.treeItemOn : ''}`}
            onClick={() => onSelect(o.id)}
          >
            <span className={styles.treeName}>{o.name}</span>
            {(count.get(o.id) ?? 0) > 0 && (
              <span className={styles.treeCount}>{count.get(o.id)}</span>
            )}
          </button>
        </div>
        {hasKids && isOpen && (
          <ul className={styles.tree}>
            {hq.map((c) => item(c, depth + 1))}
            {branches.length > 0 && (
              <li>
                <div className={styles.treeRow} style={{ paddingLeft: 6 + (depth + 1) * 14 }}>
                  <button
                    type="button"
                    className={styles.treeToggle}
                    aria-label={t('duty.expandBranches')}
                    onClick={() =>
                      setOpenBranches((s) => {
                        const n = new Set(s);
                        if (n.has(o.id)) n.delete(o.id);
                        else n.add(o.id);
                        return n;
                      })
                    }
                  >
                    {branchOpen(o.id) ? '▾' : '▸'}
                  </button>
                  <span className={styles.treeGroup}>
                    {t('duty.branches')} {branches.length}
                    {t('duty.placeSuffix')}
                  </span>
                </div>
                {branchOpen(o.id) && (
                  <ul className={styles.tree}>{branches.map((b) => item(b, depth + 2))}</ul>
                )}
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };
  return (
    <nav className={styles.treePanel} aria-label={t('duty.orgChart')}>
      <div className={styles.treeTitle}>{t('duty.orgChart')}</div>
      <ul className={styles.tree}>{kids(null).map((o) => item(o, 0))}</ul>
    </nav>
  );
}

/** 조직의 역할(미션) — 표 위 한 줄. 관리 권한이면 바로 고친다 */
function MissionBox({
  org,
  canManage,
  onSaved,
}: {
  org: DutyOrg;
  canManage: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(org.mission ?? '');
  useEffect(() => {
    setText(org.mission ?? '');
    setEditing(false);
  }, [org.id, org.mission]);
  const save = async () => {
    try {
      await api(`/duties/orgs/${org.id}/mission`, {
        method: 'PATCH',
        body: JSON.stringify({ mission: text.trim() || null }),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('duty.saveFailed') });
    }
  };
  return (
    <section className={styles.mission}>
      <div className={styles.missionHead}>
        <b>
          {org.name}
          {t('duty.roleOf')}
        </b>
        <span className={styles.muted}>
          {t('duty.members')} {org.memberCount}
          {t('duty.peopleSuffix')}
        </span>
        {canManage && !editing && (
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={t('duty.editRole')}
            title={t('duty.editRole')}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      {editing ? (
        <div className={styles.missionEdit}>
          <Textarea
            rows={2}
            value={text}
            maxLength={1000}
            autoFocus
            placeholder={t('duty.rolePh')}
            onChange={(e) => setText(e.target.value)}
          />
          <div className={styles.missionBtns}>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {t('duty.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()}>
              {t('duty.save')}
            </Button>
          </div>
        </div>
      ) : (
        <p className={org.mission ? styles.missionText : styles.muted}>
          {org.mission ?? t('duty.noRole')}
        </p>
      )}
    </section>
  );
}

interface LinkedTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  assigneeName: string | null;
}

/** 업무 항목 — 보기(이어진 작업관리 포함)·고치기·지우기 */
function DutyModal({
  duty,
  orgs,
  defaultOrgId,
  canManage,
  onClose,
  onSaved,
}: {
  duty: DutyView | null;
  orgs: DutyOrg[];
  defaultOrgId: string | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { people } = useDirectory();
  const [f, setF] = useState({
    orgUnitId: duty?.orgUnitId ?? defaultOrgId ?? '',
    title: duty?.title ?? '',
    description: duty?.description ?? '',
    ownerEmpId: duty?.ownerEmpId ?? '',
    backupEmpId: duty?.backupEmpId ?? '',
    cycle: (duty?.cycle ?? 'ALWAYS') as DutyCycle,
    tool: duty?.tool ?? '',
    linkUrl: duty?.linkUrl ?? '',
  });
  const [tasks, setTasks] = useState<LinkedTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  useEffect(() => {
    if (!duty) return;
    void api<LinkedTask[]>(`/duties/${duty.id}/tasks`)
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [duty]);

  // 담당자 — 그 조직 사람을 먼저, 그다음 다른 사람
  const personOptions = useMemo(() => {
    const own = people.filter((p) => p.orgUnitId === f.orgUnitId);
    const rest = people.filter((p) => p.orgUnitId !== f.orgUnitId);
    return [
      { value: NONE, label: t('duty.none') },
      ...[...own, ...rest].map((p) => ({
        value: p.id,
        label: `${p.name}${p.positionName ? ` ${p.positionName}` : ''} · ${p.orgUnitName ?? ''}`,
      })),
    ];
  }, [people, f.orgUnitId]);

  const save = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({
        orgUnitId: f.orgUnitId,
        title: f.title.trim(),
        description: f.description.trim() || null,
        ownerEmpId: f.ownerEmpId || null,
        backupEmpId: f.backupEmpId || null,
        cycle: f.cycle,
        tool: f.tool.trim() || null,
        linkUrl: f.linkUrl.trim() || null,
      });
      if (duty) await api(`/duties/${duty.id}`, { method: 'PATCH', body });
      else await api('/duties', { method: 'POST', body });
      toast({ type: 'success', title: duty ? t('duty.updated') : t('duty.added') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('duty.saveFailed') });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!duty) return;
    setBusy(true);
    try {
      await api(`/duties/${duty.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('duty.deleted') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('duty.deleteFailed') });
    } finally {
      setBusy(false);
    }
  };

  const ro = !canManage;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={duty ? (ro ? duty.title : t('duty.editTitle')) : t('duty.addTitle')}
      footer={
        ro ? (
          <Button variant="ghost" onClick={onClose}>
            {t('duty.close')}
          </Button>
        ) : (
          <>
            {duty && (
              <Button
                variant="ghost"
                leftIcon={<Trash2 size={14} />}
                onClick={() => void remove()}
                style={{ marginRight: 'auto' }}
              >
                {t('duty.delete')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t('duty.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!f.orgUnitId || !f.title.trim()}
              onClick={() => void save()}
            >
              {duty ? t('duty.save') : t('duty.add')}
            </Button>
          </>
        )
      }
    >
      <div className={styles.form}>
        {ro && duty ? (
          <dl className={styles.view}>
            <dt>{t('duty.col.org')}</dt>
            <dd>{duty.orgUnitName}</dd>
            <dt>{t('duty.col.owner')}</dt>
            <dd>{duty.ownerName ?? '—'}</dd>
            <dt>{t('duty.col.backup')}</dt>
            <dd>{duty.backupName ?? '—'}</dd>
            <dt>{t('duty.col.cycle')}</dt>
            <dd>{DUTY_CYCLE_LABEL[duty.cycle]}</dd>
            <dt>{t('duty.tools')}</dt>
            <dd>{duty.tool ?? '—'}</dd>
            {duty.linkUrl && (
              <>
                <dt>{t('duty.link')}</dt>
                <dd>
                  <a href={duty.linkUrl} target="_blank" rel="noopener noreferrer">
                    {t('duty.open')} <ExternalLink size={12} />
                  </a>
                </dd>
              </>
            )}
            {duty.description && (
              <>
                <dt>{t('duty.desc')}</dt>
                <dd className={styles.pre}>{duty.description}</dd>
              </>
            )}
          </dl>
        ) : (
          <>
            <label className={styles.field}>
              {t('duty.col.org')}
              <Select
                value={f.orgUnitId}
                onValueChange={(v) => set({ orgUnitId: v })}
                options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              />
            </label>
            <label className={styles.field}>
              {t('duty.col.duty')}
              <Input
                value={f.title}
                maxLength={200}
                autoFocus={!duty}
                placeholder={t('duty.titlePh')}
                onChange={(e) => set({ title: e.target.value })}
              />
            </label>
            <div className={styles.row2}>
              <label className={styles.field}>
                {t('duty.col.owner')}
                <Select
                  value={f.ownerEmpId || NONE}
                  onValueChange={(v) => set({ ownerEmpId: v === NONE ? '' : v })}
                  options={personOptions}
                />
              </label>
              <label className={styles.field}>
                {t('duty.col.backup')}
                <Select
                  value={f.backupEmpId || NONE}
                  onValueChange={(v) => set({ backupEmpId: v === NONE ? '' : v })}
                  options={personOptions}
                />
              </label>
            </div>
            <div className={styles.row2}>
              <label className={styles.field}>
                {t('duty.col.cycle')}
                <Select
                  value={f.cycle}
                  onValueChange={(v) => set({ cycle: v as DutyCycle })}
                  options={DUTY_CYCLES.map((c) => ({ value: c, label: DUTY_CYCLE_LABEL[c] }))}
                />
              </label>
              <label className={styles.field}>
                {t('duty.col.tools')}
                <Input
                  value={f.tool}
                  maxLength={100}
                  placeholder={t('duty.toolsPh')}
                  onChange={(e) => set({ tool: e.target.value })}
                />
              </label>
            </div>
            <label className={styles.field}>
              {t('duty.linkOpt')}
              <Input
                value={f.linkUrl}
                maxLength={500}
                placeholder={t('duty.linkPh')}
                onChange={(e) => set({ linkUrl: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              {t('duty.descOpt')}
              <Textarea
                rows={3}
                value={f.description}
                maxLength={2000}
                placeholder={t('duty.descPh')}
                onChange={(e) => set({ description: e.target.value })}
              />
            </label>
          </>
        )}

        {duty && (
          <div className={styles.linked}>
            <b>{t('duty.linkedTasks')}</b>
            {tasks === null ? (
              <span className={styles.muted}>{t('duty.loading')}</span>
            ) : tasks.length ? (
              <ul>
                {tasks.map((task) => (
                  <li key={task.id}>
                    <span className={styles.personDuty}>{task.title}</span>
                    <span className={styles.muted}>
                      {task.assigneeName ?? t('duty.unassigned')}
                    </span>
                    {task.dueDate && <span className={styles.muted}>~{task.dueDate.slice(5)}</span>}
                    <Badge
                      variant="subtle"
                      color={task.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}
                      size="sm"
                    >
                      {TASK_STATUS_LABEL[task.status as keyof typeof TASK_STATUS_LABEL] ??
                        task.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.muted}>
                {t('duty.linkedEmpty1')}
                {t('duty.linkedEmpty2')}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
