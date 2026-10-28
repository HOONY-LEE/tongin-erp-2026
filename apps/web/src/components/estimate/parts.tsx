import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '../ui';
import styles from './estimate.module.css';

export interface StepDef {
  key: string;
  label: string;
}

/**
 * 견적 4단계 탭. 단계 이동은 탭(tablist)의 의미라 Button 묶음이 아니라 탭 역할로 만든다 —
 * 좌우 화살표로 옮겨 다니고, 저장 안 한 변경이 있는 탭엔 점을 찍는다.
 */
export function StepTabs({
  steps,
  value,
  onChange,
  dirty,
}: {
  steps: StepDef[];
  value: string;
  onChange: (key: string) => void;
  dirty: Record<string, boolean>;
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = steps[(i + (e.key === 'ArrowRight' ? 1 : steps.length - 1)) % steps.length];
    onChange(next.key);
    (
      e.currentTarget.parentElement?.children[steps.indexOf(next)] as HTMLElement | undefined
    )?.focus();
  };
  return (
    <div className={styles.steps} role="tablist" aria-label="견적 단계">
      {steps.map((s, i) => {
        const active = s.key === value;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`est-tab-${s.key}`}
            aria-selected={active}
            aria-controls={`est-panel-${s.key}`}
            tabIndex={active ? 0 : -1}
            className={[styles.step, active ? styles.stepActive : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(s.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className={styles.stepNo}>{i + 1}.</span>
            {s.label}
            {dirty[s.key] && <span className={styles.dirtyDot} aria-label="저장 안 됨" />}
          </button>
        );
      })}
    </div>
  );
}

/** 단위가 안쪽에 붙은 숫자 입력 — "0 CBM", "90,000 원" */
export function UnitField({
  value,
  onChange,
  unit,
  disabled,
  ariaLabel,
  placeholder = '0',
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  // 금액은 천 단위 콤마로 보여준다. 값 자체는 숫자만 들고 있고(아래 onChange에서 콤마를 뺀다),
  // 보기만 바꾸는 것이라 저장·계산에는 영향이 없다.
  const shown =
    unit === '원' && value
      ? value.replace(/^(\d+)/, (int) => Number(int).toLocaleString('ko-KR'))
      : value;
  const shownPlaceholder =
    unit === '원' && /^\d+$/.test(placeholder)
      ? Number(placeholder).toLocaleString('ko-KR')
      : placeholder;
  return (
    <div className={styles.unitField}>
      <input
        inputMode="decimal"
        value={shown}
        placeholder={shownPlaceholder}
        disabled={disabled}
        aria-label={ariaLabel}
        // 숫자·소수점만 받는다(콤마는 보기용이라 입력값에서 뺀다)
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        onFocus={(e) => e.target.select()}
      />
      <span className={styles.unit}>{unit}</span>
    </div>
  );
}

/** 탭 맨 아래에 붙어 따라오는 저장 바 */
export function SaveBar({
  dirty,
  saving,
  canEdit,
  onSave,
  onReset,
  hint,
  lockedReason,
  canSave = true,
}: {
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  onSave: () => void;
  onReset: () => void;
  hint?: ReactNode;
  /** 권한은 있지만 지금은 고칠 수 없는 이유(예: 고객 서명 완료) */
  lockedReason?: string;
  /** 필수 항목이 다 채워졌는지 — false면 저장 버튼을 막는다 */
  canSave?: boolean;
}) {
  if (!canEdit || lockedReason) {
    return (
      <div className={styles.saveBar}>
        <span className={styles.saveHint}>
          {lockedReason ?? '견적 작성 권한이 없어 볼 수만 있습니다.'}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.saveBar}>
      <span className={styles.saveHint}>{dirty ? '저장하지 않은 변경이 있습니다.' : hint}</span>
      {dirty && (
        <Button variant="ghost" onClick={onReset} disabled={saving}>
          되돌리기
        </Button>
      )}
      <Button variant="primary" onClick={onSave} disabled={!dirty || !canSave || saving}>
        {saving ? '저장 중…' : '저장'}
      </Button>
    </div>
  );
}
