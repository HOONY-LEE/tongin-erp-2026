import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowRight, CalendarClock, Search } from 'lucide-react';
import { KanbanBoard, type KanbanCard, type KanbanColumn } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { TASK_STATUS, TASK_STATUS_LABEL, type DutyView, type TaskStatus } from '@tongin/shared';
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
  FormModal,
  Input,
  ListPage,
  ListToolbar,
  RecordDetail,
  SegmentedControl,
  Select,
  useToast,
  type Column,
  type FormField,
  type Row,
} from '../components/ui';
import { TaskComments } from '../components/work/TaskComments';
import { AssignModal, TaskHistory } from '../components/work/TaskHistory';
import {
  TASK_PRIORITY_META,
  TASK_STATUS_COLOR,
  TaskPriorityLabel,
  TaskStatusLabel,
} from '../components/work/TaskIcons';
import styles from './work.module.css';

interface Task {
  id: string;
  title: string;
  description: string | null;
  teamOrgId: string | null;
  team: OrgRef | null;
  assigneeEmpId: string | null;
  assignee: PersonRef | null;
  requesterEmpId: string | null;
  requester: PersonRef | null;
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
      { name: 'title', label: '업무', required: true },
      // 팀과 담당자는 따로 — 담당자가 그 팀 사람이 아니어도 된다(다른 팀에 맡기는 일 등)
      {
        name: 'teamOrgId',
        label: '팀',
        type: 'select',
        options: dir.teamOptions,
        searchable: true,
        placeholder: '팀 찾기(선택)',
        alwaysShow: true,
        pairWithNext: true,
      },
      {
        name: 'assigneeEmpId',
        label: '담당자',
        type: 'select',
        optionGroups: dir.peopleGroups,
        searchable: true,
        placeholder: '이름으로 찾기',
        alwaysShow: true,
      },
      {
        name: 'priority',
        label: '우선순위',
        type: 'select',
        options: (['A', 'B', 'C'] as const).map((v) => ({
          value: v,
          label: TASK_PRIORITY_META[v].label,
        })),
        alwaysShow: true,
        pairWithNext: true,
      },
      { name: 'dueDate', label: '기한', type: 'date', alwaysShow: true },
      {
        name: 'status',
        label: '상태',
        type: 'chips',
        options: TASK_STATUS.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] })),
        // 칸반 칸에서 '+ 업무 추가'로 열면 그 칸 상태로 채워져 있다 — 바로 보이게
        alwaysShow: true,
      },
      { name: 'project', label: '사업·프로젝트', placeholder: '예: 무브제 컨시어지' },
      // 업무분장 항목 — 고르면 그 항목의 '진행 중'에 센다
      {
        name: 'dutyId',
        label: '업무분장',
        type: 'select',
        optionGroups: dutyGroups,
        placeholder: '맡은 업무 중 하나라면 고르세요',
      },
      {
        name: 'requesterEmpId',
        label: '요청자(다른 팀이 맡긴 일)',
        type: 'select',
        optionGroups: dir.peopleGroups,
        searchable: true,
      },
      { name: 'description', label: '내용', type: 'textarea' },
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
      toast({ type: 'success', title: isNew ? '업무를 등록했습니다' : '저장했습니다' });
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
      toast({ type: 'success', title: `${TASK_STATUS_LABEL[to]}(으)로 바꿨습니다` });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(`'${task.title}' 업무를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
    }
  };

  const isMine = (task: Task) =>
    !!user?.employeeId &&
    (task.assigneeEmpId === user.employeeId || task.requesterEmpId === user.employeeId);

  const formModal = (
    <FormModal
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing === 'new' ? '업무 등록' : '업무 수정'}
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
          title={d ? d.title : '찾을 수 없습니다'}
          backLabel={t('nav.tasks')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('TASK.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    삭제
                  </Button>
                )}
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => setAssigning(true)}>
                    담당 넘기기
                  </Button>
                )}
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(d)}>
                    수정
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
                      { label: '상태', value: <TaskStatusLabel status={d.status} /> },
                      {
                        label: '우선순위',
                        value: <TaskPriorityLabel priority={d.priority} />,
                      },
                      { label: '팀', value: d.team?.name },
                      { label: '담당자', value: d.assignee?.name },
                      {
                        label: '요청자',
                        value: d.requester
                          ? [d.requester.name, d.requester.orgUnit?.name]
                              .filter(Boolean)
                              .join(' · ')
                          : null,
                      },
                      { label: '사업·프로젝트', value: d.project },
                      { label: '업무분장', value: d.duty?.title },
                      { label: '기한', value: d.dueDate ? <Due t={d} /> : null },
                      { label: '등록일', value: shortDate(d.createdAt) },
                      { label: '완료일', value: d.doneAt ? shortDate(d.doneAt) : null },
                    ],
                  },
                  {
                    title: '내용',
                    items: [
                      {
                        label: '내용',
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

  const count = (s: 'ALL' | TaskStatus) =>
    s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length;
  const statusOptions = [
    { value: 'ALL', label: `모든 상태 ${count('ALL')}` },
    ...TASK_STATUS.map((s) => ({ value: s, label: `${TASK_STATUS_LABEL[s]} ${count(s)}` })),
  ];
  const listRows = status === 'ALL' ? rows : rows.filter((r) => r.status === status);

  const columns: Column[] = [
    {
      title: '상태',
      width: 100,
      render: (r) => <TaskStatusLabel status={r.status as TaskStatus} />,
      exportValue: (r) => TASK_STATUS_LABEL[r.status as TaskStatus],
    },
    {
      title: '우선순위',
      width: 100,
      dataIndex: 'priority',
      render: (r) => <TaskPriorityLabel priority={(r as unknown as Task).priority} />,
      exportValue: (r) => TASK_PRIORITY_META[(r as unknown as Task).priority]?.label ?? '',
    },
    { title: '업무', dataIndex: 'title', flex: 1, minWidth: 240 },
    { title: '사업', dataIndex: 'project', minWidth: 130 },
    { title: '팀', width: 110, render: (r) => (r as unknown as Task).team?.name ?? '-' },
    { title: '담당', width: 90, render: (r) => (r as unknown as Task).assignee?.name ?? '-' },
    { title: '요청', width: 90, render: (r) => (r as unknown as Task).requester?.name ?? '-' },
    {
      title: '기한',
      width: 160,
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
      + 업무 등록
    </Button>
  ) : undefined;

  const scopeOptions = [
    { value: 'mine', label: '내 업무' },
    ...(canTeam
      ? [
          { value: 'team', label: '우리 팀' },
          { value: 'all', label: '전체' },
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
        { value: 'board', label: '칸반' },
        { value: 'list', label: '리스트' },
      ]}
    />
  );

  return (
    <ListPage fit title={t('nav.tasks')} onRefresh={load} updatedAt={updatedAt}>
      {view === 'list' ? (
        <DataTable
          fit
          columns={columns}
          rows={listRows as unknown as Row[]}
          loading={loading}
          onRowClick={(r) => detail.open(String(r.id))}
          viewSwitch={viewSwitch}
          // 범위 탭(내 업무·우리 팀·전체) 바로 오른쪽에 상태 고르기
          tabs={
            <>
              {scopeTabs}
              <div className={styles.statusFilter}>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as 'ALL' | TaskStatus)}
                  options={statusOptions}
                  aria-label="상태"
                />
              </div>
            </>
          }
          toolbarActions={addButton}
          exportable
          exportFileName="작업관리"
        />
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
  const d = ymd(v);
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return y === String(new Date().getFullYear()) ? `${m}.${day}` : `${y.slice(2)}.${m}.${day}`;
}

/** 이름 첫 글자 동그라미 */
function Avatar({ name }: { name: string }) {
  return <span className={styles.avatar}>{name.slice(0, 1)}</span>;
}

/** 칸반 카드 아래 — 우선순위·사업 / 기한·등록일 / 요청 → 담당 */
function CardFooter({ task }: { task: Task }) {
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
          <CalendarClock size={11} aria-hidden /> 기한 {task.dueDate ? md(task.dueDate) : '—'}
          {info && info.level !== 'ok' ? ` · ${info.label}` : ''}
        </span>
        <span>등록 {md(task.createdAt)}</span>
      </div>
      <div className={styles.kPeople}>
        {task.requester ? (
          <>
            <Avatar name={task.requester.name} />
            <span className={styles.kName}>{task.requester.name}</span>
            <ArrowRight size={12} className={styles.kMuted} aria-label="에게" />
          </>
        ) : (
          <span className={styles.kLabel}>담당</span>
        )}
        {task.assignee ? (
          <>
            <Avatar name={task.assignee.name} />
            <span className={styles.kName}>{task.assignee.name}</span>
          </>
        ) : (
          <span className={styles.kMuted}>미배정</span>
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
          toast({ type: 'error', title: '내가 맡거나 요청한 업무만 상태를 바꿀 수 있습니다' });
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
        search={
          <div className={styles.boardSearch}>
            <Search size={15} aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="업무·사업·담당자 검색"
            />
          </div>
        }
        viewSwitch={viewSwitch}
        tabs={tabs}
        actions={addButton}
      />
      {loading && !rows.length ? (
        <div className={styles.empty}>불러오는 중…</div>
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
