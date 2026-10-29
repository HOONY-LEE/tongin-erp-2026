import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TASK_STATUS, TASK_STATUS_LABEL, type TaskStatus } from '@tongin/shared';
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
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  useToast,
  type Column,
  type FormField,
  type Row,
  type StatusMap,
} from '../components/ui';
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
  const { tab: view, setTab: setView } = useTabParam<View>('list', 'view');
  const { updatedAt, touch } = useUpdatedAt();
  const dir = useWorkDirectory();
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
      {
        name: 'requesterEmpId',
        label: '요청자(다른 팀이 맡긴 일)',
        type: 'select',
        optionGroups: dir.peopleGroups,
      },
      { name: 'description', label: '내용', type: 'textarea' },
    ],
    [dir],
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
                'requesterEmpId',
                'description',
              ])
            : undefined
      }
      onSubmit={save}
    />
  );

  if (detail.id) {
    const d = rows.find((r) => r.id === detail.id);
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
        />
        {formModal}
      </>
    );
  }

  const count = (s: 'ALL' | TaskStatus) =>
    s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length;
  const statusOptions = [
    { value: 'ALL', label: `전체 ${count('ALL')}` },
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

  return (
    <ListPage
      fit={view === 'list'}
      title={t('nav.tasks')}
      onRefresh={load}
      updatedAt={updatedAt}
      actions={
        <SegmentedControl
          size="sm"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: 'list', label: '목록' },
            { value: 'board', label: '칸반' },
          ]}
        />
      }
      footer={
        scopeOptions.length > 1 ? (
          <SegmentedControl
            value={effScope}
            onChange={(v) => setScope(v as Scope)}
            options={scopeOptions}
          />
        ) : undefined
      }
    >
      {view === 'list' ? (
        <DataTable
          fit
          columns={columns}
          rows={listRows as unknown as Row[]}
          loading={loading}
          onRowClick={(r) => detail.open(String(r.id))}
          filters={
            <SegmentedControl
              value={status}
              onChange={(v) => setStatus(v as 'ALL' | TaskStatus)}
              options={statusOptions}
            />
          }
          toolbarActions={addButton}
          exportable
          exportFileName="팀업무"
        />
      ) : (
        <Board rows={rows} q={q} setQ={setQ} onOpen={detail.open} addButton={addButton} />
      )}
      {formModal}
    </ListPage>
  );
}

/** 칸반 — 상태별 칸. 카드를 누르면 상세(상태는 상세에서 바꾼다) */
function Board({
  rows,
  q,
  setQ,
  onOpen,
  addButton,
}: {
  rows: Task[];
  q: string;
  setQ: (v: string) => void;
  onOpen: (id: string) => void;
  addButton?: ReactNode;
}) {
  const term = q.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) =>
        [r.title, r.project, r.assignee?.name, r.team?.name, r.description]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(term)),
      )
    : rows;
  return (
    <>
      <div className={styles.boardBar}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" />
        {addButton}
      </div>
      <div className={styles.board}>
        {TASK_STATUS.map((s) => {
          const items = shown.filter((r) => r.status === s);
          return (
            <section key={s} className={styles.column}>
              <div className={styles.columnHead}>
                <StatusBadge value={s} map={STATUS} />
                <span className={styles.columnCount}>{items.length}</span>
              </div>
              {items.length === 0 && <div className={styles.empty}>없음</div>}
              {items.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={styles.card}
                  onClick={() => onOpen(task.id)}
                >
                  <span className={styles.cardTitle}>{task.title}</span>
                  <span className={styles.cardMeta}>
                    <StatusBadge value={task.priority} map={PRIORITY} />
                    <span>
                      {[task.team?.name, task.assignee?.name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {(task.project || task.dueDate) && (
                    <span className={styles.cardMeta}>
                      {task.project && <span>{task.project}</span>}
                      {task.dueDate && <Due t={task} />}
                    </span>
                  )}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
