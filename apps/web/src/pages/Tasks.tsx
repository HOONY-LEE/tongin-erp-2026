import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
import { TaskComments } from '../components/work/TaskComments';
import styles from './work.module.css';

interface Task {
  id: string;
  title: string;
  description: string | null;
  teamOrgId: string;
  team: OrgRef;
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

const STATUS: StatusMap = {
  TODO: { label: TASK_STATUS_LABEL.TODO, color: 'neutral' },
  IN_PROGRESS: { label: TASK_STATUS_LABEL.IN_PROGRESS, color: 'info' },
  HOLD: { label: TASK_STATUS_LABEL.HOLD, color: 'warning' },
  DONE: { label: TASK_STATUS_LABEL.DONE, color: 'success' },
};
const PRIORITY: StatusMap = {
  A: { label: 'A 긴급', color: 'error' },
  B: { label: 'B 보통', color: 'info' },
  C: { label: 'C 낮음', color: 'neutral' },
};

type Scope = 'mine' | 'team' | 'all';
type View = 'list' | 'board';

/** 칸반 칸 색(상태 점) — 할 일 회색 · 진행 중 파랑 · 완료 초록 · 보류 주황 */
const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: '#9ca3af',
  IN_PROGRESS: '#3b82f6',
  DONE: '#22c55e',
  HOLD: '#f59e0b',
};
const PRIORITY_DOT: Record<Task['priority'], { label: string; color: string }> = {
  A: { label: '긴급', color: '#ef4444' },
  B: { label: '보통', color: '#3b82f6' },
  C: { label: '낮음', color: '#9ca3af' },
};

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
 * 팀 업무 — 팀별 '담당자별 업무·업무일지' 시트 대신. 내가 담당·요청한 업무는 권한 없이 보고 상태를 바꾼다.
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
  // 업무 분장 항목(조직별 묶음) — 업무를 맡은 일에 이을 때 고른다
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
      {
        name: 'teamOrgId',
        label: '팀',
        required: true,
        type: 'select',
        options: dir.teamOptions,
        pairWithNext: true,
      },
      {
        name: 'assigneeEmpId',
        label: '담당자',
        type: 'select',
        optionGroups: dir.peopleGroups,
        alwaysShow: true,
      },
      {
        name: 'priority',
        label: '우선순위',
        type: 'select',
        options: [
          { value: 'A', label: 'A 긴급' },
          { value: 'B', label: 'B 보통' },
          { value: 'C', label: 'C 낮음' },
        ],
        alwaysShow: true,
        pairWithNext: true,
      },
      { name: 'dueDate', label: '기한', type: 'date', alwaysShow: true },
      {
        name: 'status',
        label: '상태',
        type: 'select',
        options: TASK_STATUS.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] })),
        pairWithNext: true,
      },
      { name: 'project', label: '사업·프로젝트', placeholder: '예: 무브제 컨시어지' },
      // 업무 분장 항목 — 고르면 그 항목의 '진행 중'에 센다
      {
        name: 'dutyId',
        label: '업무 분장',
        type: 'select',
        optionGroups: dutyGroups,
        placeholder: '맡은 업무 중 하나라면 고르세요',
      },
      {
        name: 'requesterEmpId',
        label: '요청자(다른 팀이 맡긴 일)',
        type: 'select',
        optionGroups: dir.peopleGroups,
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
              teamOrgId: user?.employeeOrgUnitId ?? '',
              assigneeEmpId: user?.employeeId ?? '',
              priority: 'B',
              status: 'TODO',
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
                      { label: '상태', value: <StatusBadge value={d.status} map={STATUS} /> },
                      {
                        label: '우선순위',
                        value: <StatusBadge value={d.priority} map={PRIORITY} />,
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
                      { label: '업무 분장', value: d.duty?.title },
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
          {d && <TaskComments taskId={d.id} />}
        </RecordDetail>
        {formModal}
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
      render: (r) => <StatusBadge value={String(r.status)} map={STATUS} />,
    },
    {
      title: '순위',
      width: 100,
      dataIndex: 'priority',
      render: (r) => <StatusBadge value={String(r.priority)} map={PRIORITY} />,
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
    <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
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
          filters={
            <div className={styles.statusFilter}>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as 'ALL' | TaskStatus)}
                options={statusOptions}
                aria-label="상태"
              />
            </div>
          }
          viewSwitch={viewSwitch}
          tabs={scopeTabs}
          toolbarActions={addButton}
          exportable
          exportFileName="팀업무"
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
  const p = PRIORITY_DOT[task.priority];
  const info = task.dueDate && task.status !== 'DONE' ? ddayInfo(task.dueDate, 3) : null;
  return (
    <div className={styles.kFooter}>
      <div className={styles.kRow}>
        <span className={styles.kPriority} style={{ color: p.color }}>
          <span className={styles.kDot} style={{ background: p.color }} />
          {p.label}
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
}: {
  rows: Task[];
  q: string;
  setQ: (v: string) => void;
  loading: boolean;
  viewSwitch: ReactNode;
  tabs?: ReactNode;
  addButton?: ReactNode;
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
        <div className={`task-kanban ${styles.kanbanWrap}`}>
          <KanbanBoard
            columns={cols}
            onChange={onChange}
            onCardClick={(card) => onOpen(card.id)}
            showAddButton={false}
            columnMinWidth={260}
          />
        </div>
      )}
    </>
  );
}
