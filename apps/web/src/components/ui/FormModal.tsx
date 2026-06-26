import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import type { FormField } from './types';
import { AddressField } from './AddressField';
import { ADDRESS_PARTS, addrKey } from './address';

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

  // initialValues는 초기값 prefill용 — 직렬화 키로 변화 추적
  const initKey = JSON.stringify(initialValues ?? {});
  useEffect(() => {
    if (open) setValues(initKey === '{}' ? {} : (JSON.parse(initKey) as Record<string, string>));
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
        {fields.map((f) =>
          f.type === 'address' ? (
            <AddressField
              key={f.name}
              addrPrefix={f.addrPrefix ?? ''}
              label={f.label}
              required={f.required}
              values={values}
              setField={setField}
            />
          ) : f.type === 'select' ? (
            <Select
              key={f.name}
              label={f.label}
              value={values[f.name] ?? ''}
              onValueChange={(v) => setField(f.name, v)}
              options={f.options ?? []}
              placeholder={f.placeholder}
            />
          ) : (
            <Input
              key={f.name}
              label={f.label}
              type={f.type === 'number' ? 'number' : 'text'}
              value={values[f.name] ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => setField(f.name, e.target.value)}
            />
          ),
        )}
      </div>
    </Modal>
  );
}
