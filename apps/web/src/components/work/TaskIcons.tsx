import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { TASK_STATUS_LABEL, type TaskStatus } from '@tongin/shared';

/**
 * 작업관리 상태·우선순위 표시 — 리니어(Linear)처럼 모양과 색으로.
 *  상태: 할 일(빈 원·회색) · 진행 중(반쯤 찬 원·노랑) · 완료(채운 원+체크·보라) · 보류(일시정지 원·주황)
 *  우선순위: 긴급(위 화살표·빨강) · 보통(옆 화살표·주황) · 낮음(아래 화살표·파랑)
 */
export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: '#9ca3af',
  IN_PROGRESS: '#e0a400',
  DONE: '#5e6ad2',
  HOLD: '#f2994a',
};

export function TaskStatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const c = TASK_STATUS_COLOR[status];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {status === 'DONE' ? (
        <>
          <circle cx="7" cy="7" r="6.25" fill={c} />
          <path
            d="M4.3 7.2 6.2 9 9.8 5.2"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.75" fill="none" stroke={c} strokeWidth="1.5" />
          {status === 'IN_PROGRESS' && <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill={c} />}
          {status === 'HOLD' && (
            <>
              <rect x="5" y="4.5" width="1.4" height="5" rx="0.5" fill={c} />
              <rect x="7.6" y="4.5" width="1.4" height="5" rx="0.5" fill={c} />
            </>
          )}
        </>
      )}
    </svg>
  );
}

export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <TaskStatusIcon status={status} />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

export type TaskPriority = 'A' | 'B' | 'C';
export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; color: string; Icon: typeof ArrowUp }
> = {
  A: { label: '긴급', color: '#ef4444', Icon: ArrowUp },
  B: { label: '보통', color: '#f59e0b', Icon: ArrowRight },
  C: { label: '낮음', color: '#3b82f6', Icon: ArrowDown },
};

export function TaskPriorityLabel({
  priority,
  size = 13,
  iconOnly,
}: {
  priority: TaskPriority;
  size?: number;
  iconOnly?: boolean;
}) {
  const m = TASK_PRIORITY_META[priority] ?? TASK_PRIORITY_META.B;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: m.color,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      title={`우선순위 ${m.label}`}
    >
      <m.Icon size={size} strokeWidth={2.6} aria-hidden />
      {!iconOnly && m.label}
    </span>
  );
}
