import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fmtDate } from '../lib/dateFormat';
import { EmployeeAvatar } from '../components/employee/EmployeeAvatar';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { TASK_STATUS, type DutyView, type TaskStatus } from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  ddayInfo,
  shortDate,
  toInitial,
  useWorkDirectory,
  ymd,
  type OrgRef,
  type PersonRef,
} from '../lib/workMenus';
import {
  Button,
  DataTable,
  FilterButton,
  filterRows,
  FormModal,
  ListPage,
  ListToolbar,
  RecordDetail,
  SegmentedControl,
  Select,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type FormField,
  type Row,
  SearchInput,
} from '../components/ui';
import { TaskComments } from '../components/work/TaskComments';
import { AssignModal, TaskHistory } from '../components/work/TaskHistory';
import {
  TASK_PRIORITY_META,
  TASK_STATUS_COLOR,
  TaskPriorityLabel,
  TaskStatusIcon,
  TaskStatusLabel,
} from '../components/work/TaskIcons';
import styles from './work.module.css';
import { TASK_STATUS_LABEL } from '../i18n/codes';

interface Task {
  id: string;
  /** 화면 번호 T-12(시스템이 매김) */
  seq: number;
  title: string;
  description: string | null;
  teamOrgId: string | null;
  team: OrgRef | null;
  assigneeEmpId: string | null;
  assignee: PersonRef | null;
  requesterEmpId: string | null;
  requester: PersonRef | null;
  /** 만든 사람(생성자) — 담당자와 따로 */
  creator: { id: string | null; name: string } | null;
  project: string | null;
  dutyId: string | null;
  duty: { id: string; title: string } | null;
  status: TaskStatus;
  priority: 'A' | 'B' | 'C';
  dueDate: string | null;
  doneAt: string | null;
  createdAt: string;
}

type Scope = 'mine' | 'team' | 'all';
type View = 'list' | 'board';

/** 칸반 칸 색(상태 점) — 리니어처럼: 할 일 회색 · 진행 중 노랑 · 완료 보라 · 보류 주황 */
const STATUS_COLOR = TASK_STATUS_COLOR;

/** 기한 — 끝나지 않은 일만 지남·임박을 색으로 */
function Due({ t }: { t: Task }) {
  if (!t.dueDate) return <>-</>;
  const info = t.status === 'DONE' ? null : ddayInfo(t.dueDate, 3);
  const cls = info?.level === 'over' ? styles.over : info?.level === 'soon' ? styles.soon : '';
  return (
    <span className={cls} title={info?.label}>
      {ymd(t.dueDate)}
      {info && info.level !== 'ok' ? ` (${info.label})` : ''}
    </span>
  );
}

/**
 * 작업관리 — 팀별 '담당자별 업무·업무일지' 시트 대신. 내가 담당·요청한 업무는 권한 없이 보고 상태를 바꾼다.
 * 우리 팀·전체 보기는 TASK.READ. 목록/칸반(상태별 칸) 두 가지로 본다.
 */
export default function Tasks() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, can } = useAuth();
  const detail = useDetailParam();
  const { tab: scope, setTab: setScope } = useTabParam<Scope>('mine', 'scope');
  const { tab: view, setTab: setView } = useTabParam<View>('board', 'view');
  const { updatedAt, touch } = useUpdatedAt();
  const dir = useWorkDirectory();
  // 업무분장 항목(조직별 묶음) — 업무를 맡은 일에 이을 때 고른다
  const [dutyGroups, setDutyGroups] = useState<
    { label: string; options: { value: string; label: string }[] }[]
  >([]);
  useEffect(() => {
    let alive = true;
    void api<{ duties: DutyView[] }>('/duties')
      .then(({ duties }) => {
        if (!alive) return;
        const by = new Map<string, { value: string; label: string }[]>();
        for (const d of duties) {
          const owner = d.ownerName ? ` · ${d.ownerName}` : '';
          by.set(d.orgUnitName, [
            ...(by.get(d.orgUnitName) ?? []),
            { value: d.id, label: `${d.title}${owner}` },
          ]);
        }
        setDutyGroups([...by.entries()].map(([label, options]) => ({ label, options })));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'ALL' | TaskStatus>('ALL');
  /** 목록 보기 검색 옆 필터 — 기간·우선순위·팀·담당자·기한 지남 */
  const [flt, setFlt] = useState<FilterValues>({});
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  // 칸반 칸 아래 '+ 업무 추가'로 열면 그 칸의 상태로 시작한다
  const [newStatus, setNewStatus] = useState<TaskStatus>('TODO');
  // 담당 넘기기 창 · 이력 다시 읽기 신호
  const [assigning, setAssigning] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const canTeam = can('TASK.READ');
  const effScope: Scope = canTeam ? scope : 'mine';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 서버는 기한 순 — 끝난 일은 뒤로 보낸다(같은 묶음 안에서는 순서 유지)
      const list = await api<Task[]>(`/tasks?scope=${effScope}`);
      setRows([
        ...list.filter((r) => r.status !== 'DONE'),
        ...list.filter((r) => r.status === 'DONE'),
      ]);
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [effScope, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // 알림·링크로 연 업무가 지금 목록(내 업무 등)에 없으면 하나만 따로 읽는다
  const [single, setSingle] = useState<Task | null>(null);
  useEffect(() => {
    if (!detail.id || loading || rows.some((r) => r.id === detail.id)) return;
    if (single?.id === detail.id) return;
    api<Task>(`/tasks/${detail.id}`)
      .then(setSingle)
      .catch(() => setSingle(null));
  }, [detail.id, loading, rows, single?.id]);

  const fields: FormField[] = useMemo(
    () => [
      { name: 'title', label: t('task.f.title'), required: true },
      // 팀과 담당자는 따로 — 담당자가 그 팀 사람이 아니어도 된다(다른 팀에 맡기는 일 등)
      {
        name: 'teamOrgId',
        label: t('task.f.team'),
        type: 'select',
        options: dir.teamOptions,
        searchable: true,
        placeholder: t('task.f.teamPh'),
        alwaysShow: true,
        pairWithNext: true,
      },
      {
        name: 'assigneeEmpId',
        label: t('task.f.assignee'),
        type: 'select',
        optionGroups: dir.peopleGroups,
        searchable: true,
        placeholder: t('task.findByName'),
        alwaysShow: true,
      },
      {
        name: 'priority',
        label: t('task.f.priority'),
        type: 'select',
        options: (['A', 'B', 'C'] as const).map((v) => ({
          value: v,
          label: TASK_PRIORITY_META[v].label,
        })),
        alwaysShow: true,
        pairWithNext: true,
      },
      { name: 'dueDate', label: t('task.f.due'), type: 'date', alwaysShow: true },
      {
        name: 'status',
        label: t('task.f.status'),
        type: 'chips',
        options: TASK_STATUS.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] })),
        // 칸반 칸에서 '+ 업무 추가'로 열면 그 칸 상태로 채워져 있다 — 바로 보이게
        alwaysShow: true,
      },
      { name: 'project', label: t('task.f.project'), placeholder: t('task.f.projectPh') },
      // 업무분장 항목 — 고르면 그 항목의 '진행 중'에 센다
      {
        name: 'dutyId',
        label: t('task.f.duty'),
        type: 'select',
        optionGroups: dutyGroups,
        placeholder: t('task.f.dutyPh'),
      },
      {
        name: 'requesterEmpId',
        label: t('task.f.requester'),
        type: 'select',
        optionGroups: dir.peopleGroups,
        searchable: true,
      },
      { name: 'description', label: t('task.f.desc'), type: 'textarea' },
    ],
    [dir, dutyGroups],
  );

  const save = async (values: Record<string, unknown>) => {
    const isNew = editing === 'new';
    try {
      const saved = await api<Task>(isNew ? '/tasks' : `/tasks/${(editing as Task).id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(values),
      });
      toast({ type: 'success', title: isNew ? t('task.created') : t('task.saved') });
      await load();
      if (isNew) detail.open(saved.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
      throw e;
    }
  };

  const changeStatus = async (task: Task, to: TaskStatus) => {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: to }) });
      toast({ type: 'success', title: t('task.statusChanged', { v0: TASK_STATUS_LABEL[to] }) });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(t('task.deleteQ', { v0: task.title }))) return;
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('task.deleted') });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('task.deleteFailed') });
    }
  };

  const isMine = (task: Task) =>
    !!user?.employeeId &&
    (task.assigneeEmpId === user.employeeId || task.requesterEmpId === user.employeeId);

  const formModal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? t('task.createTitle') : t('task.editTitle')}
      size="md"
      fields={fields}
      initialValues={
        editing === 'new'
          ? {
              // 팀은 골라야 들어간다(선택) — 담당자 소속과 상관없이
              teamOrgId: '',
              assigneeEmpId: user?.employeeId ?? '',
              priority: 'B',
              status: newStatus,
            }
          : editing
            ? toInitial(editing as unknown as Record<string, unknown>, [
                'title',
                'teamOrgId',
                'assigneeEmpId',
                'priority',
                'dueDate',
                'status',
                'project',
                'dutyId',
                'requesterEmpId',
                'description',
              ])
            : undefined
      }
      onSubmit={save}
    />
  );

  if (detail.id) {
    const d =
      rows.find((r) => r.id === detail.id) ?? (single?.id === detail.id ? single : undefined);
    const canEdit = !!d && (isMine(d) || can('TASK.UPDATE'));
    return (
      <>
        <RecordDetail
          loading={!d && loading}
          title={d ? d.title : t('task.notFound')}
          backLabel={t('nav.tasks')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('TASK.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    {t('task.delete')}
                  </Button>
                )}
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => setAssigning(true)}>
                    {t('task.handOff')}
                  </Button>
                )}
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(d)}>
                    {t('task.edit')}
                  </Button>
                )}
                {canEdit && (
                  <SegmentedControl
                    size="sm"
                    value={d.status}
                    onChange={(v) => v !== d.status && void changeStatus(d, v as TaskStatus)}
                    options={TASK_STATUS.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
                  />
                )}
              </>
            ) : undefined
          }
          sections={
            d
              ? [
                  {
                    items: [
                      { label: t('task.f.status'), value: <TaskStatusLabel status={d.status} /> },
                      {
                        label: t('task.f.priority'),
                        value: <TaskPriorityLabel priority={d.priority} />,
                      },
                      { label: t('task.no'), value: `T-${d.seq}` },
                      { label: t('task.f.team'), value: d.team?.name },
                      { label: t('task.f.assignee'), value: d.assignee?.name },
                      { label: t('task.creator'), value: d.creator?.name },
                      {
                        label: t('task.requester'),
                        value: d.requester
                          ? [d.requester.name, d.requester.orgUnit?.name]
                              .filter(Boolean)
                              .join(' · ')
                          : null,
                      },
                      { label: t('task.f.project'), value: d.project },
                      { label: t('task.f.duty'), value: d.duty?.title },
                      { label: t('task.f.due'), value: d.dueDate ? <Due t={d} /> : null },
                      { label: t('task.createdAt'), value: shortDate(d.createdAt) },
                      { label: t('task.doneAt'), value: d.doneAt ? shortDate(d.doneAt) : null },
                    ],
                  },
                  {
                    title: t('task.f.desc'),
                    items: [
                      {
                        label: t('task.f.desc'),
                        value: d.description ? (
                          <p className={styles.body}>{d.description}</p>
                        ) : null,
                        wide: true,
                      },
                    ],
                  },
                ]
              : []
          }
        >
          {d && (
            <TaskHistory
              taskId={d.id}
              reloadKey={`${historyKey}:${d.status}:${d.assigneeEmpId}:${d.teamOrgId}`}
            />
          )}
          {d && <TaskComments taskId={d.id} />}
        </RecordDetail>
        {formModal}
        {assigning && d && (
          <AssignModal
            taskId={d.id}
            currentEmpId={d.assigneeEmpId}
            onClose={() => setAssigning(false)}
            onDone={() => {
              setAssigning(false);
              setHistoryKey((k) => k + 1);
              // 넘긴 뒤 내 목록에서 빠질 수 있어 상세는 따로 다시 읽는다
              setSingle(null);
              void load();
            }}
          />
        )}
      </>
    );
  }

  const teamChoices = [
    ...[...new Map(rows.filter((r) => r.team).map((r) => [r.team!.id, r.team!.name])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
    ...(rows.some((r) => !r.team) ? [{ value: 'NONE', label: t('task.noTeam') }] : []),
  ];
  const filterFields: FilterField[] = [
    {
      key: 'period',
      label: t('task.flt.period'),
      type: 'date',
      options: [
        { value: 'dueDate', label: t('task.flt.due') },
        { value: 'createdAt', label: t('task.flt.created') },
        { value: 'doneAt', label: t('task.flt.done') },
      ],
    },
    {
      key: 'priority',
      label: t('task.flt.priority'),
      type: 'multi',
      options: (['A', 'B', 'C'] as const).map((p) => ({
        value: p,
        label: TASK_PRIORITY_META[p].label,
      })),
    },
    ...(teamChoices.length > 1
      ? [
          {
            key: 'team',
            label: t('task.flt.team'),
            type: 'multi',
            options: teamChoices,
          } as FilterField,
        ]
      : []),
    {
      key: 'assignee',
      label: t('task.flt.assignee'),
      type: 'multi',
      options: [
        ...new Map(
          rows.filter((r) => r.assignee).map((r) => [r.assigneeEmpId!, r.assignee!.name]),
        ).entries(),
      ]
        .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
        .map(([value, label]) => ({ value, label })),
    },
    {
      key: 'overdue',
      label: t('task.flt.overdue'),
      type: 'single',
      options: [
        { value: 'yes', label: t('task.flt.yes') },
        { value: 'no', label: t('task.flt.no') },
      ],
    },
  ];
  // 필터를 먼저 걸고, 상태 요약 숫자도 걸린 목록 기준으로
  const base = filterRows(rows, filterFields, flt, (r, key) =>
    key === 'team'
      ? (r.team?.id ?? 'NONE')
      : key === 'assignee'
        ? r.assigneeEmpId
        : key === 'overdue'
          ? r.status !== 'DONE' && r.dueDate && ddayInfo(r.dueDate, 3)?.level === 'over'
            ? 'yes'
            : 'no'
          : r[key as keyof Task],
  );
  const count = (s: 'ALL' | TaskStatus) =>
    s === 'ALL' ? base.length : base.filter((r) => r.status === s).length;
  const statusOptions = [
    { value: 'ALL', label: t('task.allStatus', { v0: count('ALL') }) },
    ...TASK_STATUS.map((s) => ({ value: s, label: `${TASK_STATUS_LABEL[s]} ${count(s)}` })),
  ];
  const term = q.trim().toLowerCase();
  const listRows = base.filter(
    (r) =>
      (status === 'ALL' || r.status === status) &&
      (!term ||
        [r.title, r.project, r.assignee?.name, r.creator?.name, `t-${r.seq}`].some((x) =>
          x?.toLowerCase().includes(term),
        )),
  );

  const columns: Column[] = [
    {
      title: t('task.no'),
      width: 80,
      render: (r) => <span className={styles.taskNo}>T-{(r as unknown as Task).seq}</span>,
      exportValue: (r) => `T-${(r as unknown as Task).seq}`,
    },
    { title: t('task.f.title'), dataIndex: 'title', flex: 1, minWidth: 220 },
    {
      title: t('task.f.priority'),
      width: 96,
      dataIndex: 'priority',
      render: (r) => <TaskPriorityLabel priority={(r as unknown as Task).priority} />,
      exportValue: (r) => TASK_PRIORITY_META[(r as unknown as Task).priority]?.label ?? '',
    },
    {
      title: t('task.f.status'),
      width: 100,
      render: (r) => <TaskStatusLabel status={r.status as TaskStatus} />,
      exportValue: (r) => TASK_STATUS_LABEL[r.status as TaskStatus],
    },
    {
      title: t('task.project'),
      minWidth: 120,
      render: (r) => (r as unknown as Task).project ?? '-',
      exportValue: (r) => (r as unknown as Task).project ?? '',
    },
    {
      title: t('task.f.team'),
      width: 110,
      render: (r) => (r as unknown as Task).team?.name ?? '-',
      exportValue: (r) => (r as unknown as Task).team?.name ?? '',
    },
    {
      title: t('task.f.assignee'),
      width: 96,
      render: (r) => (
        <PersonChip name={(r as unknown as Task).assignee?.name} empty={t('task.unassigned')} />
      ),
      exportValue: (r) => (r as unknown as Task).assignee?.name ?? '',
    },
    {
      title: t('task.creator'),
      width: 96,
      render: (r) => <PersonChip name={(r as unknown as Task).creator?.name} />,
      exportValue: (r) => (r as unknown as Task).creator?.name ?? '',
    },
    {
      title: t('task.f.due'),
      width: 150,
      dataIndex: 'dueDate',
      render: (r) => <Due t={r as unknown as Task} />,
      exportValue: (r) => ymd(r.dueDate) || null,
    },
  ];

  const addButton = can('TASK.CREATE') ? (
    <Button
      variant="primary"
      size="sm"
      onClick={() => {
        setNewStatus('TODO');
        setEditing('new');
      }}
    >
      {t('task.createBtn')}
    </Button>
  ) : undefined;

  const scopeOptions = [
    { value: 'mine', label: t('task.scope.mine') },
    ...(canTeam
      ? [
          { value: 'team', label: t('task.scope.team') },
          { value: 'all', label: t('task.scope.all') },
        ]
      : []),
  ];

  const scopeTabs =
    scopeOptions.length > 1 ? (
      <SegmentedControl
        value={effScope}
        onChange={(v) => setScope(v as Scope)}
        options={scopeOptions}
      />
    ) : undefined;
  const viewSwitch = (
    <SegmentedControl
      value={view}
      onChange={(v) => setView(v as View)}
      options={[
        { value: 'board', label: t('task.view.board') },
        { value: 'list', label: t('task.view.list') },
      ]}
    />
  );

  return (
    <ListPage fit title={t('nav.tasks')} onRefresh={load} updatedAt={updatedAt}>
      {view === 'list' ? (
        <>
          {/* 상태 요약 — 누르면 그 상태만 */}
          <div className={styles.taskStats}>
            {(['ALL', ...TASK_STATUS] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`${styles.taskStat} ${status === k ? styles.taskStatOn : ''}`}
                onClick={() => setStatus(status === k && k !== 'ALL' ? 'ALL' : k)}
              >
                <span>{k === 'ALL' ? t('task.allTasks') : `${TASK_STATUS_LABEL[k]}`}</span>
                <b>{count(k)}</b>
                {k === 'ALL' ? (
                  <i className={styles.taskStatIcon} aria-hidden />
                ) : (
                  <span className={styles.taskStatIcon}>
                    <TaskStatusIcon status={k} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <DataTable
            fit
            columns={columns}
            rows={listRows as unknown as Row[]}
            loading={loading}
            onRowClick={(r) => detail.open(String(r.id))}
            viewSwitch={viewSwitch}
            filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
            // 범위 탭(내 업무·우리 팀·전체) 오른쪽에 상태 고르기(우선순위·팀은 검색 옆 필터로)
            tabs={
              <>
                {scopeTabs}
                <div className={styles.statusFilter}>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as 'ALL' | TaskStatus)}
                    options={statusOptions}
                    aria-label={t('task.f.status')}
                  />
                </div>
              </>
            }
            toolbarActions={addButton}
            exportable
            exportFileName={t('task.exportName')}
          />
        </>
      ) : (
        <Board
          rows={rows}
          q={q}
          setQ={setQ}
          loading={loading}
          viewSwitch={viewSwitch}
          tabs={scopeTabs}
          addButton={addButton}
          onAdd={
            can('TASK.CREATE')
              ? (st) => {
                  setNewStatus(st);
                  setEditing('new');
                }
              : undefined
          }
          canMove={(task) => isMine(task) || can('TASK.UPDATE')}
          onMove={(task, to) => void changeStatus(task, to)}
          onOpen={detail.open}
        />
      )}
      {formModal}
    </ListPage>
  );
}

/** 카드용 짧은 날짜 — 올해면 11.03, 아니면 25.11.03 */
function md(v: string): string {
  return fmtDate(ymd(v)) || '—';
}

/** 목록의 사람 칩(담당자·생성자) */
function PersonChip({ name, empty = '-' }: { name?: string | null; empty?: string }) {
  return name ? (
    <span className={styles.personChip}>{name}</span>
  ) : (
    <span className={styles.kMuted}>{empty}</span>
  );
}

/** 이름 첫 글자 동그라미 */
function Avatar({ id, name }: { id?: string; name: string }) {
  return <EmployeeAvatar id={id} name={name} size={20} />;
}

/** 칸반 카드 아래 — 우선순위·사업 / 기한·등록일 / 요청 → 담당 */
function CardFooter({ task }: { task: Task }) {
  const { t } = useTranslation();
  const info = task.dueDate && task.status !== 'DONE' ? ddayInfo(task.dueDate, 3) : null;
  return (
    <div className={styles.kFooter}>
      <div className={styles.kRow}>
        <span className={styles.kPriority}>
          <TaskPriorityLabel priority={task.priority} size={12} />
        </span>
        <span className={styles.kChip}>{task.project || task.team?.name}</span>
      </div>
      <div className={`${styles.kRow} ${styles.kMuted}`}>
        <span
          className={`${styles.kDue} ${info?.level === 'over' ? styles.over : info?.level === 'soon' ? styles.soon : ''}`}
        >
          <CalendarClock size={11} aria-hidden /> {t('task.f.due')}{' '}
          {task.dueDate ? md(task.dueDate) : '—'}
          {info && info.level !== 'ok' ? ` · ${info.label}` : ''}
        </span>
        <span>
          {t('task.created2')} {md(task.createdAt)}
        </span>
      </div>
      <div className={styles.kPeople}>
        {task.requester ? (
          <>
            <Avatar id={task.requester.id} name={task.requester.name} />
            <span className={styles.kName}>{task.requester.name}</span>
            <ArrowRight size={12} className={styles.kMuted} aria-label={t('task.to')} />
          </>
        ) : (
          <span className={styles.kLabel}>{t('task.owner')}</span>
        )}
        {task.assignee ? (
          <>
            <Avatar id={task.assignee.id} name={task.assignee.name} />
            <span className={styles.kName}>{task.assignee.name}</span>
          </>
        ) : (
          <span className={styles.kMuted}>{t('task.unassigned')}</span>
        )}
      </div>
    </div>
  );
}

/**
 * 칸반 — 할 일 · 진행 중 · 완료 · 보류. 카드를 끌어 다른 칸에 놓으면 상태가 바뀐다(내 업무이거나 수정 권한).
 * 카드를 누르면 상세.
 */
function Board({
  rows,
  q,
  setQ,
  loading,
  canMove,
  onMove,
  onOpen,
  viewSwitch,
  tabs,
  addButton,
  onAdd,
}: {
  rows: Task[];
  q: string;
  setQ: (v: string) => void;
  loading: boolean;
  viewSwitch: ReactNode;
  tabs?: ReactNode;
  addButton?: ReactNode;
  /** 칸 아래 '+ 업무 추가' — 그 칸의 상태로 등록 창을 연다 */
  onAdd?: (status: TaskStatus) => void;
  canMove: (task: Task) => boolean;
  onMove: (task: Task, to: TaskStatus) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const term = q.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) =>
        [r.title, r.project, r.assignee?.name, r.requester?.name, r.team?.name, r.description]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(term)),
      )
    : rows;
  // 칸반이 들고 있는 순서(끌어 옮긴 직후 바로 보이게) — 목록이 새로 오면 다시 맞춘다
  const make = (list: Task[]): KanbanColumn[] =>
    TASK_STATUS.map((s) => ({
      id: s,
      title: TASK_STATUS_LABEL[s],
      color: STATUS_COLOR[s],
      cards: list
        .filter((r) => r.status === s)
        .map((r): KanbanCard => ({ id: r.id, title: r.title, footer: <CardFooter task={r} /> })),
    }));
  const [cols, setCols] = useState<KanbanColumn[]>(() => make(shown));
  // 카드가 칸을 꽉 채워 스크롤이 생긴 칸은 '+ 업무 추가'를 숨긴다(억지로 자리를 남기지 않게)
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const mark = () => {
      for (const col of wrap.querySelectorAll<HTMLElement>("[class*='_column_sj7t4']")) {
        const list = col.querySelector<HTMLElement>("[class*='_cardList_sj7t4']");
        const add = col.querySelector<HTMLElement>("[class*='_addButton_sj7t4']");
        if (!list) continue;
        // 버튼 높이만큼 남는 자리가 없으면(목록이 스크롤되거나 버튼이 칸 밖으로 밀리면) 숨김
        const colBox = col.getBoundingClientRect();
        const full =
          list.scrollHeight > list.clientHeight + 1 ||
          (!!add && list.getBoundingClientRect().bottom + 8 + add.offsetHeight > colBox.bottom);
        col.classList.toggle('kanban-col-full', full);
      }
    };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [cols]);
  const key = shown.map((r) => `${r.id}:${r.status}:${r.priority}:${r.dueDate}`).join('|');
  useEffect(() => {
    setCols(make(shown));
    // 내용이 바뀔 때만(key) 다시 만든다
  }, [key]);

  const onChange = (next: KanbanColumn[]) => {
    for (const col of next) {
      for (const card of col.cards) {
        const task = rows.find((r) => r.id === card.id);
        if (!task || task.status === col.id) continue;
        if (!canMove(task)) {
          toast({ type: 'error', title: t('task.onlyMine') });
          setCols(make(shown));
          return;
        }
        onMove(task, col.id as TaskStatus);
      }
    }
    setCols(next);
  };

  return (
    <>
      <ListToolbar
        search={<SearchInput value={q} onChange={setQ} placeholder={t('task.search')} />}
        viewSwitch={viewSwitch}
        tabs={tabs}
        actions={addButton}
      />
      {loading && !rows.length ? (
        <div className={styles.empty}>{t('task.loading')}</div>
      ) : (
        <div ref={wrapRef} className={`task-kanban ${styles.kanbanWrap}`}>
          <KanbanBoard
            columns={cols}
            onChange={onChange}
            onCardClick={(card) => onOpen(card.id)}
            showAddButton={!!onAdd}
            onAddCard={(colId) => onAdd?.(colId as TaskStatus)}
            columnMinWidth={260}
          />
        </div>
      )}
    </>
  );
}
