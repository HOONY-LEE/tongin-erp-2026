import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Input, Modal, Select, useToast } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import type { FormField } from './types';
import { AddressField } from './AddressField';
import { ADDRESS_PARTS, addrKey } from './address';
import { formatPhone } from '../../lib/phone';

/** akron Input/Select 기본 라벨 스타일과 맞춘 커스텀 라벨(필수 표시는 테마색 *). */
function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span
      style={{
        fontSize: 'var(--ark-font-size-sm)',
        fontWeight: 'var(--ark-font-weight-medium, 500)',
        color: 'var(--ark-color-text)',
        lineHeight: 'var(--ark-line-height-normal, 1.4)',
      }}
    >
      {label}
      {required && <span style={{ color: 'var(--ark-color-primary-500)' }}> *</span>}
    </span>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: FormField[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  size?: 'sm' | 'md' | 'lg';
  /** 열릴 때 채워둘 초기값(예: 리드에서 고객 prefill). */
  initialValues?: Record<string, string>;
}

/** 필드 정의로 입력 폼을 렌더하는 공통 모달 (값 관리·필수검증·저장 라이프사이클 내장). */
export function FormModal({
  open,
  onOpenChange,
  title,
  fields,
  onSubmit,
  size = 'sm',
  initialValues,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  // initialValues는 초기값 prefill용 — 직렬화 키로 변화 추적
  const initKey = JSON.stringify(initialValues ?? {});
  useEffect(() => {
    if (open) {
      setValues(initKey === '{}' ? {} : (JSON.parse(initKey) as Record<string, string>));
      setShowOptional(false);
    }
  }, [open, initKey]);

  const setField = (n: string, v: string) => setValues((s) => ({ ...s, [n]: v }));

  const submit = async () => {
    for (const f of fields) {
      const missing =
        f.type === 'address'
          ? !values[addrKey(f.addrPrefix ?? '', 'zipcode')] ||
            !values[addrKey(f.addrPrefix ?? '', 'addr')]
          : !values[f.name];
      if (f.required && missing) {
        toast({ type: 'warning', title: `${f.label} — ${t('common.required')}` });
        return;
      }
    }
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === 'address') {
        for (const part of ADDRESS_PARTS) {
          const key = addrKey(f.addrPrefix ?? '', part);
          const v = values[key];
          if (v === undefined || v === '') continue;
          payload[key] = part === 'lat' || part === 'lng' ? Number(v) : v;
        }
        continue;
      }
      const v = values[f.name];
      if (v === undefined || v === '') continue;
      payload[f.name] = f.type === 'number' ? Number(v) : v;
    }
    setSaving(true);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch {
      // 실패 시 모달 유지 (오류 토스트는 onSubmit 측에서 처리)
    } finally {
      setSaving(false);
    }
  };

  const visibleFields = fields.filter((f) => f.required || f.alwaysShow);
  const hiddenFields = fields.filter((f) => !f.required && !f.alwaysShow);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size={size}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {renderRows(visibleFields, values, setField)}
        {hiddenFields.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                alignSelf: 'flex-start',
                border: 'none',
                background: 'transparent',
                color: 'var(--ark-color-text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
                padding: '2px 0',
              }}
            >
              {showOptional ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              선택 항목 {showOptional ? '접기' : `더보기 (${hiddenFields.length})`}
            </button>
            {showOptional && renderRows(hiddenFields, values, setField)}
          </>
        )}
      </div>
    </Modal>
  );
}

/** pairWithNext가 있으면 바로 다음 필드와 한 줄에 절반씩 배치. */
function renderRows(
  list: FormField[],
  values: Record<string, string>,
  setField: (n: string, v: string) => void,
) {
  const rows: ReactNode[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.pairWithNext && i + 1 < list.length) {
      const next = list[i + 1];
      rows.push(
        <div key={f.name} style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{renderField(f, values, setField)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>{renderField(next, values, setField)}</div>
        </div>,
      );
      i++;
    } else {
      rows.push(renderField(f, values, setField));
    }
  }
  return rows;
}

function renderField(
  f: FormField,
  values: Record<string, string>,
  setField: (n: string, v: string) => void,
) {
  if (f.type === 'address') {
    return (
      <AddressField
        key={f.name}
        addrPrefix={f.addrPrefix ?? ''}
        label={f.label}
        required={f.required}
        values={values}
        setField={setField}
      />
    );
  }
  return (
    <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <FieldLabel label={f.label} required={f.required} />
      {f.type === 'select' ? (
        <Select
          value={values[f.name] ?? ''}
          onValueChange={(v) => setField(f.name, v)}
          options={f.options ?? []}
          placeholder={f.placeholder}
          disabled={f.disabled}
        />
      ) : (
        <Input
          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
          value={values[f.name] ?? ''}
          placeholder={f.type === 'tel' ? '010-0000-0000' : f.placeholder}
          onChange={(e) =>
            setField(f.name, f.type === 'tel' ? formatPhone(e.target.value) : e.target.value)
          }
          disabled={f.disabled}
        />
      )}
    </div>
  );
}
