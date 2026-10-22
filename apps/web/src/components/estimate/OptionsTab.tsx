import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  ACCESS_LABEL,
  ACCESS_METHODS,
  BUNDLE_ROLE_LABEL,
  type EstimateOptionDef,
  type EstimateOptionGroup,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Badge, Checkbox, Input, Select, useToast } from '../ui';
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
  /** 상품 구성 밖에서 추가한 상품(화면에 보이는 순서) */
  extras: string[];
}

const priceText = (v: string | number | null) => (v == null || !Number(v) ? '' : String(Number(v)));

/**
 * 상품 상태는 카탈로그 행 id로 묶는다.
 * 필수 상품은 항상 켜 두고, 3단계를 아직 저장한 적 없는 견적이면 '기본선택' 상품도 켜 둔다.
 */
const derive = (d: EstimateDetailData): OptionsForm => {
  const options: Record<string, OptionState> = {};
  const extras: string[] = [];
  for (const def of d.optionCatalog) {
    if (def.kind === 'VOLUME') continue;
    const a = d.addons.find((x) => x.addonServiceId === def.id);
    const preset = def.role === 'REQUIRED' || (!d.optionsSavedAt && def.role === 'DEFAULT');
    options[def.id] = {
      selected: !!a || preset,
      variant: a?.variant ?? def.variants?.[0]?.value ?? '',
      serviceDate: a?.serviceDate ? a.serviceDate.slice(0, 10) : '',
      amount: a ? priceText(a.amount) : preset ? priceText(def.bundlePrice) : '',
      memo: a?.memo ?? '',
    };
    if (a && def.role === null) extras.push(def.id);
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
    extras,
  };
};

/**
 * 3. 옵션선택 — 작업조건과, 상품 구성(가정이사 등)에 든 상품 + 구성 밖 추가 상품.
 * 상품·구성은 상품관리에서 관리한다(서버가 견적 상세와 함께 내려준다). 가격은 견적마다 적는다.
 */
export function OptionsTab({ data, canEdit, onSaved, onDirtyChange }: TabProps) {
  const toast = useToast();
  const { form, setForm, dirty, reset, accept } = useTabForm(data, derive, onDirtyChange);
  const [saving, setSaving] = useState(false);

  const services = useMemo(
    () => data.optionCatalog.filter((d) => d.kind !== 'VOLUME'),
    [data.optionCatalog],
  );
  const byId = useMemo(() => new Map(services.map((d) => [d.id, d])), [services]);
  const bundled = services.filter((d) => d.role !== null);
  const extraCandidates = services.filter(
    (d) => d.role === null && d.isActive && !form.extras.includes(d.id),
  );
  // 예전 방식(자유 입력)으로 담긴 옵션 — 카탈로그에 없는 줄은 저장하면 정리되므로 미리 알린다
  const legacy = data.addons.filter((a) => !a.addonServiceId);

  const total = useMemo(
    () =>
      Object.values(form.options)
        .filter((o) => o.selected)
        .reduce((s, o) => s + toNum(o.amount), 0),
    [form],
  );

  const setSide = (side: 'from' | 'to', patch: Partial<SideCondition>) =>
    setForm((f) => ({ ...f, [side]: { ...f[side], ...patch } }));
  const setOpt = (id: string, patch: Partial<OptionState>) =>
    setForm((f) => ({ ...f, options: { ...f.options, [id]: { ...f.options[id], ...patch } } }));
  /** 켤 때 금액이 비어 있으면 구성 단가(없으면 상품 기본가)를 채운다 */
  const check = (def: EstimateOptionDef, on: boolean) =>
    setOpt(def.id, {
      selected: on,
      ...(on && !form.options[def.id]?.amount ? { amount: priceText(def.bundlePrice) } : {}),
    });
  const addExtra = (id: string) => {
    const def = byId.get(id);
    if (!def) return;
    setForm((f) => ({
      ...f,
      extras: [...f.extras, id],
      options: {
        ...f.options,
        [id]: {
          ...f.options[id],
          selected: true,
          amount: f.options[id]?.amount || priceText(def.price),
        },
      },
    }));
  };
  const removeExtra = (id: string) =>
    setForm((f) => ({
      ...f,
      extras: f.extras.filter((x) => x !== id),
      options: { ...f.options, [id]: { ...f.options[id], selected: false } },
    }));

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
      const chosen = [...bundled.map((d) => d.id), ...form.extras].filter(
        (id) => form.options[id]?.selected,
      );
      const next = await api<EstimateDetailData>(`/estimates/${data.id}/options`, {
        method: 'PUT',
        body: JSON.stringify({
          fromPyeong: f.pyeong,
          fromAccess: f.access,
          fromAccessNote: f.note,
          toPyeong: t.pyeong,
          toAccess: t.access,
          toAccessNote: t.note,
          options: chosen.map((id) => {
            const d = byId.get(id)!;
            const o = form.options[id];
            return {
              addonServiceId: id,
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

  const optionRow = (def: EstimateOptionDef, extra = false) => {
    const o = form.options[def.id];
    if (!o) return null;
    const required = def.role === 'REQUIRED';
    const off = !o.selected;
    const label = def.isActive ? def.name : `${def.name} (사용 안 함)`;
    return (
      <div key={def.id}>
        <div className={[styles.optRow, off ? styles.optOff : ''].filter(Boolean).join(' ')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {extra ? (
              <span className={styles.itemName}>{label}</span>
            ) : (
              <Checkbox
                checked={o.selected}
                onCheckedChange={(v) => check(def, v === true)}
                label={label}
                disabled={!canEdit || required}
              />
            )}
            {def.role && def.role !== 'OPTIONAL' && (
              <Badge variant="subtle" color={required ? 'primary' : 'neutral'}>
                {BUNDLE_ROLE_LABEL[def.role]}
              </Badge>
            )}
          </div>
          {def.variants ? (
            <Select
              value={o.variant}
              onValueChange={(v) => setOpt(def.id, { variant: v })}
              options={def.variants}
              disabled={!canEdit || off}
            />
          ) : (
            <span />
          )}
          {def.hasDate ? (
            <Input
              type="date"
              aria-label={`${def.name} 요청일`}
              value={o.serviceDate}
              onChange={(e) => setOpt(def.id, { serviceDate: e.target.value })}
              disabled={!canEdit || off}
            />
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <UnitField
                value={o.amount}
                unit="원"
                ariaLabel={`${def.name} 금액`}
                disabled={!canEdit || off}
                onChange={(v) => setOpt(def.id, { amount: v })}
              />
            </div>
            {extra && canEdit && (
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`${def.name} 빼기`}
                onClick={() => removeExtra(def.id)}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        {def.hasNote && o.selected && (
          <Input
            value={o.memo}
            placeholder={def.groupCode === 'ETC' ? '보관 기간·물량 등' : '내용을 적어 주세요'}
            onChange={(e) => setOpt(def.id, { memo: e.target.value })}
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

      {GROUPS.map((g) => {
        const rows = bundled.filter((d) => d.groupCode === g.key);
        if (!rows.length) return null;
        return (
          <div key={g.key} className={styles.panel}>
            <h3 className={styles.panelTitle}>
              {g.title} <span className={styles.sub}>{g.sub}</span>
            </h3>
            {rows.map((d) => optionRow(d))}
          </div>
        );
      })}
      {bundled.length === 0 && (
        <div className={styles.sub}>
          이 상품 구성에 들어 있는 상품이 없습니다. 상품관리 › 상품구성에서 넣거나, 아래에서 추가
          상품으로 고르세요.
        </div>
      )}

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>
          추가 상품 <span className={styles.sub}>/구성 밖에서 더 파는 상품</span>
        </h3>
        {form.extras.map((id) => {
          const d = byId.get(id);
          return d ? optionRow(d, true) : null;
        })}
        {canEdit && extraCandidates.length > 0 && (
          <div style={{ maxWidth: 360, marginTop: form.extras.length ? 10 : 0 }}>
            <Select
              value=""
              onValueChange={addExtra}
              options={extraCandidates.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="상품 추가…"
            />
          </div>
        )}
        {!form.extras.length && !extraCandidates.length && (
          <div className={styles.sub}>더 고를 상품이 없습니다.</div>
        )}
      </div>

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
        hint={`선택한 상품 합계 ${won(total)}`}
      />
    </div>
  );
}
