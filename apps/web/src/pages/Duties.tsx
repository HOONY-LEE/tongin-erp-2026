import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Pencil, Search, Trash2 } from 'lucide-react';
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
 * 업무 분장 — 조직마다 맡는 역할(미션)과 업무 항목·주/부 담당자·주기·쓰는 도구.
 * 조직별(표) · 사람별(카드) · 내 업무. 작업관리(칸반)를 항목에 이으면 '진행 중'이 실제로 센다.
 * 보기는 누구나, 정하기는 DUTY.MANAGE.
 */
export default function Duties() {
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
  // 처음 고른 조직 — 주소에 있으면 그것, 아니면 내 조직(업무 분장이 있으면), 아니면 업무 분장이 있는 첫 조직
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
        { value: 'org', label: '조직별' },
        { value: 'person', label: '사람별' },
        { value: 'mine', label: '내 업무' },
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
      + 업무 추가
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
    { title: '업무', dataIndex: 'title', flex: 1, minWidth: 220 },
    {
      title: '주 담당',
      dataIndex: 'ownerName',
      width: 100,
      render: (r) => (r.ownerName as string) ?? '—',
    },
    {
      title: '부 담당',
      dataIndex: 'backupName',
      width: 100,
      render: (r) => (r.backupName as string) ?? '—',
    },
    {
      title: '주기',
      width: 70,
      render: (r) => DUTY_CYCLE_LABEL[r.cycle as DutyCycle],
    },
    {
      title: '쓰는 도구·에이전트',
      dataIndex: 'tool',
      width: 170,
      render: (r) => (r.tool as string) ?? '—',
    },
    {
      title: '진행 중',
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
    { title: '조직', dataIndex: 'orgUnitName', width: 110 },
    {
      title: '내 역할',
      width: 80,
      render: (r) => (r.ownerEmpId === user?.employeeId ? '주 담당' : '부 담당'),
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
        title="업무 분장"
        subtitle="조직마다 맡는 역할과 업무 항목·주/부 담당자·주기·쓰는 도구를 정해 둡니다. 작업관리(칸반)의 업무를 이 항목에 이으면 '진행 중'에 실제로 하고 있는 일이 셉니다."
        onRefresh={load}
        updatedAt={updatedAt}
      />

      {tab !== 'mine' && org && <MissionBox org={org} canManage={canManage} onSaved={load} />}

      {tab === 'person' ? (
        <>
          <div className="dt-wrap">
            <ListToolbar
              search={
                <div className="sft-toolbar__search-wrap">
                  <span className="sft-toolbar__search-icon" aria-hidden="true">
                    <Search size={15} />
                  </span>
                  <input
                    className="sft-toolbar__search"
                    type="search"
                    value={query}
                    placeholder="이름·업무 찾기"
                    aria-label="이름·업무 찾기"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              }
              filters={orgSelect}
              tabs={tabs}
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
                    업무 {p.own.length + p.backup.length}개
                    {p.backup.length > 0 && (
                      <span className={styles.muted}>
                        {' '}
                        (주 {p.own.length} · 부 {p.backup.length})
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
                            부
                          </Badge>
                        )}
                        <span className={styles.personDuty}>{d.title}</span>
                        <span className={styles.muted}>{DUTY_CYCLE_LABEL[d.cycle]}</span>
                        {d.inProgress > 0 && (
                          <Badge variant="subtle" color="warning" size="sm">
                            진행 {d.inProgress}
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
                  <b className={styles.personName}>담당자 없음</b>
                  <span className={styles.personCount}>{personCards.unassigned.length}개</span>
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
                이 조직에 정한 업무 분장이 없습니다
                {canManage ? ' — 「+ 업무 추가」로 정하세요.' : '.'}
              </div>
            )}
          </div>
        </>
      ) : (
        <DataTable
          columns={tab === 'mine' ? mineColumns : orgColumns}
          rows={
            (tab === 'mine'
              ? duties.filter(
                  (d) => d.ownerEmpId === user?.employeeId || d.backupEmpId === user?.employeeId,
                )
              : duties.filter((d) => d.orgUnitId === orgId)
            ).filter(match) as unknown as Row[]
          }
          loading={loading}
          fit
          pageSize={0}
          exportable
          exportFileName={tab === 'mine' ? '내_업무분장' : `업무분장_${org?.name ?? ''}`}
          filters={tab === 'org' ? orgSelect : undefined}
          tabs={tabs}
          toolbarActions={tab === 'org' ? addButton : undefined}
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    }
  };
  return (
    <section className={styles.mission}>
      <div className={styles.missionHead}>
        <b>{org.name}의 역할</b>
        <span className={styles.muted}>구성원 {org.memberCount}명</span>
        {canManage && !editing && (
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="역할 고치기"
            title="역할 고치기"
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
            placeholder="이 조직이 맡는 일을 한두 문장으로(예: 가맹점 모집·계약부터 교육·점검까지 가맹점 운영을 돕는다)"
            onChange={(e) => setText(e.target.value)}
          />
          <div className={styles.missionBtns}>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()}>
              저장
            </Button>
          </div>
        </div>
      ) : (
        <p className={org.mission ? styles.missionText : styles.muted}>
          {org.mission ?? '아직 정한 역할이 없습니다.'}
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
      { value: NONE, label: '없음' },
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
      toast({ type: 'success', title: duty ? '업무 분장을 고쳤습니다' : '업무를 추가했습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!duty) return;
    setBusy(true);
    try {
      await api(`/duties/${duty.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '업무 분장을 지웠습니다(이어진 작업관리 업무는 그대로)' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
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
      title={duty ? (ro ? duty.title : '업무 분장 고치기') : '업무 추가'}
      footer={
        ro ? (
          <Button variant="ghost" onClick={onClose}>
            닫기
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
                지우기
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!f.orgUnitId || !f.title.trim()}
              onClick={() => void save()}
            >
              {duty ? '저장' : '추가'}
            </Button>
          </>
        )
      }
    >
      <div className={styles.form}>
        {ro && duty ? (
          <dl className={styles.view}>
            <dt>조직</dt>
            <dd>{duty.orgUnitName}</dd>
            <dt>주 담당</dt>
            <dd>{duty.ownerName ?? '—'}</dd>
            <dt>부 담당</dt>
            <dd>{duty.backupName ?? '—'}</dd>
            <dt>주기</dt>
            <dd>{DUTY_CYCLE_LABEL[duty.cycle]}</dd>
            <dt>쓰는 도구</dt>
            <dd>{duty.tool ?? '—'}</dd>
            {duty.linkUrl && (
              <>
                <dt>링크</dt>
                <dd>
                  <a href={duty.linkUrl} target="_blank" rel="noopener noreferrer">
                    열기 <ExternalLink size={12} />
                  </a>
                </dd>
              </>
            )}
            {duty.description && (
              <>
                <dt>설명</dt>
                <dd className={styles.pre}>{duty.description}</dd>
              </>
            )}
          </dl>
        ) : (
          <>
            <label className={styles.field}>
              조직
              <Select
                value={f.orgUnitId}
                onValueChange={(v) => set({ orgUnitId: v })}
                options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              />
            </label>
            <label className={styles.field}>
              업무
              <Input
                value={f.title}
                maxLength={200}
                autoFocus={!duty}
                placeholder="예: 재계약 대상 검토 및 공문 발송"
                onChange={(e) => set({ title: e.target.value })}
              />
            </label>
            <div className={styles.row2}>
              <label className={styles.field}>
                주 담당
                <Select
                  value={f.ownerEmpId || NONE}
                  onValueChange={(v) => set({ ownerEmpId: v === NONE ? '' : v })}
                  options={personOptions}
                />
              </label>
              <label className={styles.field}>
                부 담당
                <Select
                  value={f.backupEmpId || NONE}
                  onValueChange={(v) => set({ backupEmpId: v === NONE ? '' : v })}
                  options={personOptions}
                />
              </label>
            </div>
            <div className={styles.row2}>
              <label className={styles.field}>
                주기
                <Select
                  value={f.cycle}
                  onValueChange={(v) => set({ cycle: v as DutyCycle })}
                  options={DUTY_CYCLES.map((c) => ({ value: c, label: DUTY_CYCLE_LABEL[c] }))}
                />
              </label>
              <label className={styles.field}>
                쓰는 도구·에이전트
                <Input
                  value={f.tool}
                  maxLength={100}
                  placeholder="예: 재계약 Agent, 수기"
                  onChange={(e) => set({ tool: e.target.value })}
                />
              </label>
            </div>
            <label className={styles.field}>
              링크(선택)
              <Input
                value={f.linkUrl}
                maxLength={500}
                placeholder="https://…(업무에 쓰는 시트·폼·에이전트 주소)"
                onChange={(e) => set({ linkUrl: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              설명(선택)
              <Textarea
                rows={3}
                value={f.description}
                maxLength={2000}
                placeholder="업무 범위·기준·주의할 점"
                onChange={(e) => set({ description: e.target.value })}
              />
            </label>
          </>
        )}

        {duty && (
          <div className={styles.linked}>
            <b>이어진 작업관리 업무(안 끝난 것)</b>
            {tasks === null ? (
              <span className={styles.muted}>불러오는 중…</span>
            ) : tasks.length ? (
              <ul>
                {tasks.map((t) => (
                  <li key={t.id}>
                    <span className={styles.personDuty}>{t.title}</span>
                    <span className={styles.muted}>{t.assigneeName ?? '담당 없음'}</span>
                    {t.dueDate && <span className={styles.muted}>~{t.dueDate.slice(5)}</span>}
                    <Badge
                      variant="subtle"
                      color={t.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}
                      size="sm"
                    >
                      {TASK_STATUS_LABEL[t.status as keyof typeof TASK_STATUS_LABEL] ?? t.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.muted}>
                없습니다 — 작업관리에서 업무를 만들 때 「업무 분장」에서 이 항목을 고르면 여기에
                모입니다.
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
