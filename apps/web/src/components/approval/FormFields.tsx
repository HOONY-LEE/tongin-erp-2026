import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import {
  FORM_FIELD_TYPES,
  FORM_FIELD_TYPE_LABEL,
  type FormField,
  type FormFieldType,
  type FormValue,
} from '@tongin/shared';
import { useDirectory } from '../../lib/approvals';
import { Button, Checkbox, Input, Select, Textarea } from '../ui';
import styles from './formFields.module.css';

/** 화면에서 채우는 값 — person은 고른 직원 id 목록(서버가 이름을 붙인다) */
export type FormDraft = Record<string, unknown>;

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 필수 항목이 다 찼는지 — 확인 버튼을 막는 데 쓴다(자세한 확인은 서버) */
export function formReady(fields: FormField[], values: FormDraft) {
  return fields.every((f) => {
    if (!f.required) return true;
    const v = values[f.id];
    if (f.type === 'checkbox') return v === true;
    if (f.type === 'person') return Array.isArray(v) && v.length > 0;
    if (f.type === 'daterange') {
      const r = v as { from?: string; to?: string } | undefined;
      return !!r?.from && !!r?.to;
    }
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
}

/** 직원 여러 명 고르기 — 칩 + 검색 */
export function PersonPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { people } = useDirectory();
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const options = useMemo(
    () =>
      people
        .filter((p) => !value.includes(p.id))
        .map((p) => ({
          value: p.id,
          label: p.name,
          description: [p.positionName, p.orgUnitName].filter(Boolean).join(' · '),
        })),
    [people, value],
  );
  return (
    <div className={styles.people}>
      {value.map((id) => (
        <span key={id} className={styles.chip}>
          {byId.get(id)?.name ?? '…'}
          <button
            type="button"
            aria-label="빼기"
            onClick={() => onChange(value.filter((x) => x !== id))}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <Combobox
        options={options}
        value={null}
        placeholder="직원 찾기"
        searchPlaceholder="이름으로 찾기"
        onChange={(v) => v && onChange([...value, v])}
      />
    </div>
  );
}

/** 결재 양식 항목 입력 */
export function FormFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: FormField[];
  values: FormDraft;
  onChange: (next: FormDraft) => void;
}) {
  const set = (id: string, v: unknown) => onChange({ ...values, [id]: v });
  return (
    <>
      {fields.map((f) => {
        const v = values[f.id];
        const label = (
          <span>
            {f.label}
            {f.required && <span className={styles.req}> *</span>}
          </span>
        );
        let input: React.ReactNode;
        switch (f.type) {
          case 'textarea':
            input = (
              <Textarea
                rows={3}
                value={String(v ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => set(f.id, e.target.value)}
              />
            );
            break;
          case 'number':
          case 'money':
            input = (
              <div className={styles.moneyRow}>
                <Input
                  inputMode="numeric"
                  value={String(v ?? '')}
                  placeholder={f.placeholder ?? (f.type === 'money' ? '0' : '')}
                  onChange={(e) => set(f.id, e.target.value.replace(/[^\d.,-]/g, ''))}
                />
                {f.type === 'money' && v !== undefined && String(v).trim() !== '' && (
                  <span className={styles.hint}>
                    {won(Math.round(Number(String(v).replace(/,/g, '')) || 0))}
                  </span>
                )}
              </div>
            );
            break;
          case 'date':
            input = (
              <Input
                type="date"
                value={String(v ?? '')}
                onChange={(e) => set(f.id, e.target.value)}
              />
            );
            break;
          case 'daterange': {
            const r = (v as { from?: string; to?: string } | undefined) ?? {};
            input = (
              <div className={styles.range}>
                <Input
                  type="date"
                  value={r.from ?? ''}
                  onChange={(e) => set(f.id, { ...r, from: e.target.value })}
                />
                <span>~</span>
                <Input
                  type="date"
                  value={r.to ?? ''}
                  min={r.from || undefined}
                  onChange={(e) => set(f.id, { ...r, to: e.target.value })}
                />
              </div>
            );
            break;
          }
          case 'select':
            input = (
              <Select
                value={String(v ?? '')}
                placeholder="고르세요"
                onValueChange={(x) => set(f.id, x)}
                options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
              />
            );
            break;
          case 'checkbox':
            return (
              <div key={f.id} className={styles.field}>
                <Checkbox
                  checked={v === true}
                  onCheckedChange={(c) => set(f.id, c === true)}
                  label={`${f.label}${f.required ? ' *' : ''}`}
                  description={f.help}
                />
              </div>
            );
          case 'person':
            input = (
              <PersonPicker
                value={Array.isArray(v) ? (v as string[]) : []}
                onChange={(x) => set(f.id, x)}
              />
            );
            break;
          default:
            input = (
              <Input
                value={String(v ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => set(f.id, e.target.value)}
              />
            );
        }
        return (
          <label key={f.id} className={styles.field}>
            {label}
            {input}
            {f.help && <span className={styles.hint}>{f.help}</span>}
          </label>
        );
      })}
    </>
  );
}

/** 올린 값 보기(결재 상세) — 그때의 항목 정의대로 */
export function FormValuesView({
  fields,
  values,
}: {
  fields: FormField[];
  values: Record<string, FormValue>;
}) {
  const show = (f: FormField): string => {
    const v = values[f.id];
    if (v === null || v === undefined || v === '') return '-';
    switch (f.type) {
      case 'money':
        return won(Number(v));
      case 'number':
        return Number(v).toLocaleString('ko-KR');
      case 'checkbox':
        return v ? '예' : '아니오';
      case 'daterange': {
        const r = v as { from: string; to: string };
        return r.from === r.to ? r.from : `${r.from} ~ ${r.to}`;
      }
      case 'person':
        return (v as { name: string }[]).map((x) => x.name).join(', ');
      default:
        return String(v);
    }
  };
  return (
    <dl className={styles.view}>
      {fields.map((f) => (
        <div key={f.id} className={f.type === 'textarea' ? styles.viewWide : undefined}>
          <dt>{f.label}</dt>
          <dd>{show(f)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 새 항목 id — 영문+숫자, 양식 안에서 겹치지 않게 */
const newId = (fields: FormField[]) => {
  let i = fields.length + 1;
  while (fields.some((f) => f.id === `f${i}`)) i++;
  return `f${i}`;
};

/**
 * 항목 만들기 — 이름·종류·필수·선택지·도움말. 위/아래로 순서를 바꾼다.
 * 오른쪽(또는 아래)에 실제 신청 화면 미리보기를 함께 보여 준다.
 */
export function FormBuilder({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (next: FormField[]) => void;
}) {
  const [preview, setPreview] = useState<FormDraft>({});
  const set = (i: number, patch: Partial<FormField>) =>
    onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([...fields, { id: newId(fields), label: '', type: 'text', required: false }]);

  return (
    <div className={styles.builder}>
      <div className={styles.builderList}>
        {fields.length === 0 && (
          <p className={styles.hint}>
            아직 항목이 없습니다. 「항목 추가」로 신청서에 받을 내용을 정하세요.
          </p>
        )}
        {fields.map((f, i) => (
          <div key={f.id} className={styles.builderItem}>
            <div className={styles.builderRow}>
              <span className={styles.no}>{i + 1}</span>
              <Input
                value={f.label}
                maxLength={50}
                placeholder="항목 이름(예: 금액)"
                aria-label={`${i + 1}번째 항목 이름`}
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <Select
                value={f.type}
                onValueChange={(t) =>
                  set(i, {
                    type: t as FormFieldType,
                    options: t === 'select' ? (f.options?.length ? f.options : ['']) : undefined,
                  })
                }
                options={FORM_FIELD_TYPES.map((t) => ({
                  value: t,
                  label: FORM_FIELD_TYPE_LABEL[t],
                }))}
              />
              <Checkbox
                checked={f.required}
                onCheckedChange={(c) => set(i, { required: c === true })}
                label="필수"
              />
              <button
                type="button"
                className={styles.iconBtn}
                title="위로"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="아래로"
                disabled={i === fields.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="항목 지우기"
                onClick={() => onChange(fields.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {f.type === 'select' && (
              <Input
                value={(f.options ?? []).join(', ')}
                placeholder="고를 값을 쉼표로 나눠 적으세요(예: 교통비, 식대, 소모품)"
                aria-label="선택지"
                onChange={(e) =>
                  set(i, { options: e.target.value.split(',').map((x) => x.trimStart()) })
                }
              />
            )}
            <Input
              value={f.help ?? ''}
              maxLength={200}
              placeholder="도움말(선택) — 입력칸 아래 작은 글씨로 보입니다"
              aria-label="도움말"
              onChange={(e) => set(i, { help: e.target.value || undefined })}
            />
          </div>
        ))}
        <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={add}>
          항목 추가
        </Button>
      </div>
      <aside className={styles.preview} aria-label="신청 화면 미리보기">
        <div className={styles.previewHead}>미리보기</div>
        <div className={styles.previewBody}>
          <FormFieldInputs
            fields={fields
              .filter((f) => f.label.trim())
              .map((f) => ({ ...f, options: f.options?.map((o) => o.trim()).filter(Boolean) }))}
            values={preview}
            onChange={setPreview}
          />
          {!fields.some((f) => f.label.trim()) && (
            <p className={styles.hint}>항목을 넣으면 여기서 보입니다.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

/** 저장 전 정리 — 선택지 공백·빈 값 빼기 */
export const cleanFieldsForSave = (fields: FormField[]): FormField[] =>
  fields.map((f) => ({
    ...f,
    label: f.label.trim(),
    options:
      f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    help: f.help?.trim() || undefined,
  }));
