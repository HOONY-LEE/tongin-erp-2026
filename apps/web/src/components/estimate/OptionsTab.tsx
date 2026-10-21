import { useMemo, useState } from 'react';
import {
  ACCESS_LABEL,
  ACCESS_METHODS,
  ESTIMATE_OPTIONS,
  type EstimateOptionDef,
  type EstimateOptionGroup,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Checkbox, Input, Select, useToast } from '../ui';
import { SaveBar, UnitField } from './parts';
import { useTabForm } from './useTabForm';
import { toNum, won, type EstimateDetailData, type TabProps } from './types';
import styles from './estimate.module.css';

const ACCESS_OPTIONS = ACCESS_METHODS.map((a) => ({ value: a, label: ACCESS_LABEL[a] }));
const GROUPS: { key: EstimateOptionGroup; title: string; sub: string }[] = [
  { key: 'LADDER', title: '사다리차 서비스', sub: '/Ladder Truck' },
  { key: 'LIVING', title: '생활 서비스', sub: '/Living Service' },
  { key: 'ASSEMBLY', title: '분해 · 설치', sub: '/Disassembly & Installation' },
  { key: 'ETC', title: '기타', sub: '/Etc' },
];

interface OptionState {
  selected: boolean;
  variant: string;
  serviceDate: string;
  amount: string;
  memo: string;
}
interface SideCondition {
  pyeong: string;
  access: string;
  note: string;
}
interface OptionsForm {
  from: SideCondition;
  to: SideCondition;
  options: Record<string, OptionState>;
}

const derive = (d: EstimateDetailData): OptionsForm => {
  const options: Record<string, OptionState> = {};
  for (const def of ESTIMATE_OPTIONS) {
    const a = d.addons.find((x) => x.code === def.code);
    options[def.code] = {
      selected: !!a,
      variant: a?.variant ?? def.variants?.[0]?.value ?? '',
      serviceDate: a?.serviceDate ? a.serviceDate.slice(0, 10) : '',
      amount: a && Number(a.amount) ? String(Number(a.amount)) : '',
      memo: a?.memo ?? '',
    };
  }
  const side = (pyeong: number | null, access: string, note: string | null): SideCondition => ({
    pyeong: pyeong == null ? '' : String(pyeong),
    access,
    note: note ?? '',
  });
  return {
    from: side(d.fromPyeong, d.fromAccess, d.fromAccessNote),
    to: side(d.toPyeong, d.toAccess, d.toAccessNote),
    options,
  };
};

/** 3. 옵션선택 — 작업조건과 부가 서비스. 가격은 견적마다 직접 적는다. */
export function OptionsTab({ data, canEdit, onSaved, onDirtyChange }: TabProps) {
  const toast = useToast();
  const { form, setForm, dirty, reset, accept } = useTabForm(data, derive, onDirtyChange);
  const [saving, setSaving] = useState(false);

  // 예전 방식(자유 입력)으로 담긴 옵션 — 새 화면은 정의된 옵션만 저장하므로 미리 알린다
  const legacy = data.addons.filter((a) => !a.code);

  const total = useMemo(
    () =>
      Object.values(form.options)
        .filter((o) => o.selected)
        .reduce((s, o) => s + toNum(o.amount), 0),
    [form],
  );

  const setSide = (side: 'from' | 'to', patch: Partial<SideCondition>) =>
    setForm((f) => ({ ...f, [side]: { ...f[side], ...patch } }));
  const setOpt = (code: string, patch: Partial<OptionState>) =>
    setForm((f) => ({ ...f, options: { ...f.options, [code]: { ...f.options[code], ...patch } } }));

  const save = async () => {
    setSaving(true);
    try {
      const side = (s: SideCondition) => ({
        pyeong: s.pyeong === '' ? undefined : Math.round(toNum(s.pyeong)),
        access: s.access,
        note: s.access === 'ETC' ? s.note.trim() || undefined : undefined,
      });
      const f = side(form.from);
      const t = side(form.to);
      const next = await api<EstimateDetailData>(`/estimates/${data.id}/options`, {
        method: 'PUT',
        body: JSON.stringify({
          fromPyeong: f.pyeong,
          fromAccess: f.access,
          fromAccessNote: f.note,
          toPyeong: t.pyeong,
          toAccess: t.access,
          toAccessNote: t.note,
          options: ESTIMATE_OPTIONS.filter((d) => form.options[d.code].selected).map((d) => {
            const o = form.options[d.code];
            return {
              code: d.code,
              variant: d.variants ? o.variant : undefined,
              serviceDate: d.hasDate && o.serviceDate ? o.serviceDate : undefined,
              amount: toNum(o.amount),
              memo: d.hasNote ? o.memo.trim() || undefined : undefined,
            };
          }),
        }),
      });
      accept(next);
      onSaved(next);
      toast({ type: 'success', title: '옵션을 저장했습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  const conditionBox = (side: 'from' | 'to', title: string) => {
    const c = form[side];
    return (
      <div className={styles.field} style={{ gap: 10 }}>
        <span className={styles.fieldLabel}>{title}</span>
        <div className={styles.row2}>
          <UnitField
            value={c.pyeong}
            unit="평"
            ariaLabel={`${title} 평수`}
            disabled={!canEdit}
            onChange={(v) => setSide(side, { pyeong: v })}
          />
          <Select
            value={c.access}
            onValueChange={(v) => setSide(side, { access: v })}
            options={ACCESS_OPTIONS}
            disabled={!canEdit}
          />
        </div>
        {c.access === 'ETC' && (
          <Input
            value={c.note}
            placeholder="작업방식 내용 (예: 곤돌라)"
            onChange={(e) => setSide(side, { note: e.target.value })}
            disabled={!canEdit}
          />
        )}
      </div>
    );
  };

  const optionRow = (def: EstimateOptionDef) => {
    const o = form.options[def.code];
    const off = !o.selected;
    return (
      <div key={def.code}>
        <div className={[styles.optRow, off ? styles.optOff : ''].filter(Boolean).join(' ')}>
          <Checkbox
            checked={o.selected}
            onCheckedChange={(v) => setOpt(def.code, { selected: v === true })}
            label={def.label}
            disabled={!canEdit}
          />
          {def.variants ? (
            <Select
              value={o.variant}
              onValueChange={(v) => setOpt(def.code, { variant: v })}
              options={def.variants}
              disabled={!canEdit || off}
            />
          ) : (
            <span />
          )}
          {def.hasDate ? (
            <Input
              type="date"
              aria-label={`${def.label} 요청일`}
              value={o.serviceDate}
              onChange={(e) => setOpt(def.code, { serviceDate: e.target.value })}
              disabled={!canEdit || off}
            />
          ) : (
            <span />
          )}
          <UnitField
            value={o.amount}
            unit="원"
            ariaLabel={`${def.label} 금액`}
            disabled={!canEdit || off}
            onChange={(v) => setOpt(def.code, { amount: v })}
          />
        </div>
        {def.hasNote && o.selected && (
          <Input
            value={o.memo}
            placeholder={def.group === 'ETC' ? '보관 기간·물량 등' : '내용을 적어 주세요'}
            onChange={(e) => setOpt(def.code, { memo: e.target.value })}
            disabled={!canEdit}
            style={{ marginBottom: 8 }}
          />
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>
          작업 조건 <span className={styles.sub}>/Work Condition</span>
        </h3>
        <div className={styles.row2} style={{ gap: 20 }}>
          {conditionBox('from', '전 작업조건 (출발지)')}
          {conditionBox('to', '후 작업조건 (도착지)')}
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.key} className={styles.panel}>
          <h3 className={styles.panelTitle}>
            {g.title} <span className={styles.sub}>{g.sub}</span>
          </h3>
          {ESTIMATE_OPTIONS.filter((d) => d.group === g.key).map(optionRow)}
        </div>
      ))}

      {legacy.length > 0 && (
        <div className={styles.sub}>
          예전 방식으로 직접 입력한 옵션 {legacy.length}건({legacy.map((a) => a.name).join(', ')})은
          저장하면 정리됩니다. 필요하면 위 목록에서 다시 골라 주세요.
        </div>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving}
        canEdit={canEdit}
        onSave={save}
        onReset={reset}
        hint={`선택한 옵션 합계 ${won(total)}`}
      />
    </div>
  );
}
