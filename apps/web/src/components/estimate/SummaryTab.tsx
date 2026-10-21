import { useMemo, useState, type ReactNode } from 'react';
import { summarizeVolume } from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Button, SegmentedControl, useToast } from '../ui';
import { SaveBar, UnitField } from './parts';
import { useTabForm } from './useTabForm';
import { toNum, won, type EstimateDetailData, type TabProps } from './types';
import styles from './estimate.module.css';

interface AmountForm {
  moveAmount: string;
  vatMode: string;
  vatAmount: string;
  depositAmount: string;
  balanceAmount: string;
}
const num = (v: string | number | null) => (v == null || !Number(v) ? '' : String(Number(v)));
const derive = (d: EstimateDetailData): AmountForm => ({
  moveAmount: num(d.moveAmount),
  vatMode: d.vatMode,
  vatAmount: num(d.vatAmount),
  depositAmount: num(d.depositAmount),
  balanceAmount: num(d.balanceAmount),
});

function Line({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 0' }}>
      <span style={{ flex: 1, color: 'var(--ark-color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 20 : undefined }}>
        {value}
      </span>
    </div>
  );
}

/**
 * 4. 견적·계약서 — 옵션 가격을 모아 보고 이사비용·부가세·계약금·잔금을 정한다.
 * 총비용은 입력값으로 바로 미리 보여주고, 저장하면 서버가 같은 규칙으로 다시 계산한다.
 */
export function SummaryTab({
  data,
  canEdit,
  onSaved,
  onDirtyChange,
  actions,
}: TabProps & { actions: ReactNode }) {
  const toast = useToast();
  const { form, setForm, dirty, reset, accept } = useTabForm(data, derive, onDirtyChange);
  const [saving, setSaving] = useState(false);

  const volume = useMemo(() => summarizeVolume(data.lines), [data.lines]);
  const optionTotal = data.addons.reduce((s, a) => s + Number(a.amount || 0), 0);
  const included = form.vatMode === 'INCLUDED';
  const total = toNum(form.moveAmount) + optionTotal + (included ? toNum(form.vatAmount) : 0);
  const deposit = toNum(form.depositAmount);
  const balanceGap =
    form.depositAmount !== '' && form.balanceAmount !== ''
      ? deposit + toNum(form.balanceAmount) - total
      : 0;

  const set = <K extends keyof AmountForm>(k: K, v: AmountForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const n = (v: string) => (v === '' ? undefined : toNum(v));
      const next = await api<EstimateDetailData>(`/estimates/${data.id}/amounts`, {
        method: 'PUT',
        body: JSON.stringify({
          moveAmount: n(form.moveAmount),
          vatMode: form.vatMode,
          vatAmount: included ? n(form.vatAmount) : undefined,
          depositAmount: n(form.depositAmount),
          balanceAmount: n(form.balanceAmount),
        }),
      });
      // 금액 저장 응답은 견적 본문만 돌려준다 — 화면이 쓰는 상세(메타 포함)로 다시 읽는다
      const fresh = next.meta ? next : await api<EstimateDetailData>(`/estimates/${data.id}`);
      accept(fresh);
      onSaved(fresh);
      toast({ type: 'success', title: '견적 금액을 저장했습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>
          물량 <span className={styles.sub}>/Volume</span>
        </h3>
        <div className={[styles.volGrid, styles.volGrid4].join(' ')}>
          {(
            [
              ['이사물량', volume.moving],
              ['경유물량', volume.transit],
              ['폐기물량', volume.discard],
              ['전체물량', volume.total],
            ] as const
          ).map(([label, v], i) => (
            <div key={label} className={[styles.volCard, i === 3 ? styles.volTotal : ''].join(' ')}>
              <div className={styles.infoLabel}>{label}</div>
              <div className={styles.volValue} style={{ fontSize: 18 }}>
                {v} <span className={styles.unit}>CBM</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>
          옵션 비용 <span className={styles.sub}>/Option</span>
        </h3>
        {data.addons.length === 0 ? (
          <div className={styles.sub}>
            선택한 옵션이 없습니다. 3단계(옵션선택)에서 고를 수 있습니다.
          </div>
        ) : (
          <>
            {data.addons.map((a) => (
              <Line
                key={a.id}
                label={
                  <>
                    {a.name}
                    {a.serviceDate && (
                      <span className={styles.sub}> · 요청일 {a.serviceDate.slice(0, 10)}</span>
                    )}
                    {a.memo && <span className={styles.sub}> · {a.memo}</span>}
                  </>
                }
                value={won(a.amount)}
              />
            ))}
            <div style={{ borderTop: '1px solid var(--ark-color-border)', marginTop: 4 }}>
              <Line label="옵션 합계" value={won(optionTotal)} />
            </div>
          </>
        )}
      </div>

      <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 className={styles.panelTitle} style={{ marginBottom: 0 }}>
          견적 금액 <span className={styles.sub}>/Amount</span>
        </h3>
        <div className={styles.row2}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>이사비용 (옵션 제외)</span>
            <UnitField
              value={form.moveAmount}
              unit="원"
              ariaLabel="이사비용"
              disabled={!canEdit}
              onChange={(v) => set('moveAmount', v)}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>부가세</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SegmentedControl
                value={form.vatMode}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    vatMode: v,
                    vatAmount: v === 'EXCLUDED' ? '' : f.vatAmount,
                  }))
                }
                options={[
                  { value: 'EXCLUDED', label: '불포함' },
                  { value: 'INCLUDED', label: '포함' },
                ]}
                size="sm"
                disabled={!canEdit}
              />
              {included && (
                <div style={{ flex: 1 }}>
                  <UnitField
                    value={form.vatAmount}
                    unit="원"
                    ariaLabel="부가세 금액"
                    disabled={!canEdit}
                    placeholder={String(Math.round((toNum(form.moveAmount) + optionTotal) * 0.1))}
                    onChange={(v) => set('vatAmount', v)}
                  />
                </div>
              )}
            </div>
            {included && !form.vatAmount && (
              <span className={styles.sub}>
                비워 두면 0원 — 흐린 숫자는 공급가의 10% 참고값입니다.
              </span>
            )}
          </div>
        </div>

        <div className={styles.volCard + ' ' + styles.volTotal}>
          <Line label={`총비용${included ? ' (부가세 포함)' : ''}`} value={won(total)} strong />
        </div>

        <div className={styles.row2}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>계약금</span>
            <UnitField
              value={form.depositAmount}
              unit="원"
              ariaLabel="계약금"
              disabled={!canEdit}
              onChange={(v) => set('depositAmount', v)}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>잔금</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <UnitField
                  value={form.balanceAmount}
                  unit="원"
                  ariaLabel="잔금"
                  disabled={!canEdit}
                  placeholder={deposit ? String(Math.max(0, total - deposit)) : '0'}
                  onChange={(v) => set('balanceAmount', v)}
                />
              </div>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => set('balanceAmount', String(Math.max(0, total - deposit)))}
                >
                  총비용−계약금
                </Button>
              )}
            </div>
          </div>
        </div>
        {balanceGap !== 0 && (
          <div style={{ fontSize: 13, color: 'var(--ark-color-warning-600, #d97706)' }}>
            계약금 + 잔금이 총비용과 {won(Math.abs(balanceGap))}{' '}
            {balanceGap > 0 ? '많습니다' : '적습니다'}. 계약 전환 시 잔금은 총비용 − 계약금으로
            정해집니다.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {actions}
      </div>

      <SaveBar dirty={dirty} saving={saving} canEdit={canEdit} onSave={save} onReset={reset} />
    </div>
  );
}
