import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  KPI_MAX_METRICS,
  KPI_MIN_METRICS,
  isKpiAutoKey,
  type KpiCatalogItem,
  type KpiResult,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Button, Input, Modal, Select, Textarea, useToast } from '../ui';
import styles from '../../pages/performance.module.css';

interface Line {
  key: string;
  label: string;
  unit: string;
  auto: boolean;
  target: string;
  weight: string;
  actual: string;
}

/**
 * 지표 구성·실적 입력 — 지표 3~8개를 고르고 목표·가중치를 정한다.
 * 자동 지표는 ERP 기록에서 실적을 세고, 직접 지표(이름·단위를 정해 추가)는 여기서 실적을 넣는다.
 */
export function KpiConfigModal({
  scope,
  scopeId,
  name,
  period,
  catalog,
  current,
  onClose,
  onSaved,
}: {
  scope: 'ORG' | 'EMPLOYEE';
  scopeId: string;
  name: string;
  period: string;
  catalog: KpiCatalogItem[];
  current: KpiResult;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>(() =>
    current.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      unit: m.unit,
      auto: m.auto,
      target: String(m.target),
      weight: String(m.weight),
      actual: !m.auto && m.actual !== null ? String(m.actual) : '',
    })),
  );
  const [note, setNote] = useState(current.note ?? '');
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const unused = catalog.filter((c) => !lines.some((l) => l.key === c.key));
  const full = lines.length >= KPI_MAX_METRICS;
  const num = (s: string) => Number(s.replace(/,/g, ''));
  const invalid =
    lines.length < KPI_MIN_METRICS ||
    lines.some(
      (l) => !(num(l.target) > 0) || !(num(l.weight) >= 1) || (!l.auto && !l.label.trim()),
    );

  const save = async () => {
    setBusy(true);
    try {
      await api('/kpi', {
        method: 'PUT',
        body: JSON.stringify({
          scope,
          scopeId,
          period,
          metrics: lines.map((l) => ({
            key: l.key,
            ...(l.auto ? {} : { label: l.label.trim(), unit: l.unit.trim() }),
            target: num(l.target),
            weight: Math.min(10, Math.max(1, Math.round(num(l.weight)))),
          })),
          actuals: Object.fromEntries(
            lines
              .filter((l) => !l.auto && l.actual.trim() !== '' && Number.isFinite(num(l.actual)))
              .map((l) => [l.key, num(l.actual)]),
          ),
          note: note.trim() || null,
        }),
      });
      toast({ type: 'success', title: '성과 지표를 저장했습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api(`/kpi/${scope}/${scopeId}?period=${period}`, { method: 'DELETE' });
      toast({
        type: 'success',
        title: scope === 'ORG' ? '기본 구성으로 되돌렸습니다' : '소속 조직 구성을 따르게 했습니다',
      });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '되돌리지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`${name} · 지표 구성·실적 입력 (${period.replace('-Q', '년 ')}분기)`}
      footer={
        <>
          {current.source === 'OWN' && (
            <Button variant="ghost" onClick={() => void reset()} style={{ marginRight: 'auto' }}>
              {scope === 'ORG' ? '기본 구성으로 되돌리기' : '조직 구성 따르기'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} disabled={invalid} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div className={styles.cfg}>
        <div className={`${styles.cfgRow} ${styles.cfgHead}`}>
          <span>지표</span>
          <span>목표</span>
          <span>가중치</span>
          <span>실적(직접 지표)</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={l.key} className={styles.cfgRow}>
            {l.auto ? (
              <span className={styles.cfgName}>
                <b>{l.label}</b>
                <span className={styles.muted}>자동 · {l.unit}</span>
              </span>
            ) : (
              <span className={styles.cfgCustom}>
                <Input
                  value={l.label}
                  placeholder="지표 이름(예: 신규 가맹)"
                  maxLength={40}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
                <Input
                  value={l.unit}
                  placeholder="단위"
                  maxLength={10}
                  onChange={(e) => set(i, { unit: e.target.value })}
                />
              </span>
            )}
            <Input
              inputMode="decimal"
              value={l.target}
              aria-label={`${l.label} 목표`}
              onChange={(e) => set(i, { target: e.target.value })}
            />
            <Input
              inputMode="numeric"
              value={l.weight}
              aria-label={`${l.label} 가중치`}
              onChange={(e) => set(i, { weight: e.target.value })}
            />
            {l.auto ? (
              <span className={styles.muted}>ERP 기록에서 계산</span>
            ) : (
              <Input
                inputMode="decimal"
                value={l.actual}
                placeholder="실적"
                aria-label={`${l.label} 실적`}
                onChange={(e) => set(i, { actual: e.target.value })}
              />
            )}
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`${l.label || '지표'} 빼기`}
              disabled={lines.length <= KPI_MIN_METRICS}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <div className={styles.cfgAdd}>
          {unused.length > 0 && (
            <div style={{ width: 220 }}>
              <Select
                value=""
                placeholder="자동 지표 더하기"
                disabled={full}
                onValueChange={(k) => {
                  const c = catalog.find((x) => x.key === k);
                  if (!c) return;
                  setLines((ls) => [
                    ...ls,
                    {
                      key: c.key,
                      label: c.label,
                      unit: c.unit,
                      auto: true,
                      target: String(c.defaultTarget),
                      weight: '1',
                      actual: '',
                    },
                  ]);
                }}
                options={unused.map((c) => ({ value: c.key, label: `${c.label} (${c.unit})` }))}
              />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            disabled={full}
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  key: `custom:${Date.now().toString(36)}`,
                  label: '',
                  unit: '',
                  auto: false,
                  target: '',
                  weight: '1',
                  actual: '',
                },
              ])
            }
          >
            직접 지표 더하기
          </Button>
          <span className={styles.muted}>
            {lines.length}/{KPI_MAX_METRICS}개 · 최소 {KPI_MIN_METRICS}개
          </span>
        </div>
        <p className={styles.hint}>
          목표는 이 분기 기준입니다. 달성률 = 실적 ÷ 목표(100%에서 잘라 점수에 반영), 종합 점수 =
          달성률의 가중 평균 · 등급 S(95~) A(85~) B(70~) C(55~) D.
          {lines.some((l) => !isKpiAutoKey(l.key)) &&
            ' 직접 지표는 이 조직·직원에게만 쓰입니다(직원에게 이어지지 않음).'}
        </p>
        <label className={styles.cfgNote}>
          메모
          <Textarea
            rows={2}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
