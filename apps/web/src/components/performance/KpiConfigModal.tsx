import { useTranslation } from 'react-i18next';
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
  bulk,
  onClose,
  onSaved,
}: {
  scope: 'ORG' | 'EMPLOYEE';
  scopeId: string;
  name: string;
  period: string;
  catalog: KpiCatalogItem[];
  current: KpiResult;
  /** 여러 명(조직)에 한꺼번에 — 실적은 사람마다 넣은 것을 그대로 둔다 */
  bulk?: { scopeIds: string[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
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

  // 가중치 → 종합 점수 반영 비율(%)
  const wsum = lines.reduce((t, l) => t + (num(l.weight) >= 1 ? num(l.weight) : 0), 0);
  const share = (l: Line) =>
    wsum && num(l.weight) >= 1 ? `${Math.round((num(l.weight) / wsum) * 100)}%` : '—';

  const save = async () => {
    setBusy(true);
    const metrics = lines.map((l) => ({
      key: l.key,
      ...(l.auto ? {} : { label: l.label.trim(), unit: l.unit.trim() }),
      target: num(l.target),
      weight: Math.min(10, Math.max(1, Math.round(num(l.weight)))),
    }));
    try {
      if (bulk)
        await api('/kpi/bulk', {
          method: 'PUT',
          body: JSON.stringify({
            scope,
            scopeIds: bulk.scopeIds,
            period,
            metrics,
            note: note.trim() || null,
          }),
        });
      else
        await api('/kpi', {
          method: 'PUT',
          body: JSON.stringify({
            scope,
            scopeId,
            period,
            metrics,
            actuals: Object.fromEntries(
              lines
                .filter((l) => !l.auto && l.actual.trim() !== '' && Number.isFinite(num(l.actual)))
                .map((l) => [l.key, num(l.actual)]),
            ),
            note: note.trim() || null,
          }),
        });
      toast({
        type: 'success',
        title: bulk ? t('perf.bulkSaved', { v0: bulk.scopeIds.length }) : t('perf.saved'),
      });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('perf.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      if (bulk)
        await api('/kpi/bulk-reset', {
          method: 'POST',
          body: JSON.stringify({ scope, scopeIds: bulk.scopeIds, period }),
        });
      else await api(`/kpi/${scope}/${scopeId}?period=${period}`, { method: 'DELETE' });
      toast({
        type: 'success',
        title: scope === 'ORG' ? t('perf.resetDefault') : t('perf.resetOrg'),
      });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('perf.resetFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('perf.modalTitle', {
        v0: name,
        v1: bulk ? t('perf.bulkSet') : t('perf.configure'),
        v2: period.replace('-Q', '년 '),
      })}
      footer={
        <>
          {(bulk || current.source === 'OWN') && (
            <Button variant="ghost" onClick={() => void reset()} style={{ marginRight: 'auto' }}>
              {scope === 'ORG'
                ? t('perf.resetDefaultBtn')
                : bulk
                  ? t('perf.allFollowOrg')
                  : t('perf.followOrgBtn')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('perf.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={invalid} onClick={() => void save()}>
            {t('perf.save')}
          </Button>
        </>
      }
    >
      <div className={styles.cfg}>
        <div className={`${styles.cfgRow} ${styles.cfgHead}`}>
          <span>{t('perf.col.metrics')}</span>
          <span>{t('perf.goal')}</span>
          <span>{t('perf.weightLabel')}</span>
          <span>{t('perf.actualManual')}</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={l.key} className={styles.cfgRow}>
            {l.auto ? (
              <span className={styles.cfgName}>
                <b>{l.label}</b>
                <span className={styles.muted}>
                  {t('perf.autoSep')} {l.unit}
                </span>
              </span>
            ) : (
              <span className={styles.cfgCustom}>
                <Input
                  value={l.label}
                  placeholder={t('perf.metricNamePh')}
                  maxLength={40}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
                <Input
                  value={l.unit}
                  placeholder={t('perf.unit')}
                  maxLength={10}
                  onChange={(e) => set(i, { unit: e.target.value })}
                />
              </span>
            )}
            <Input
              inputMode="decimal"
              value={l.target}
              aria-label={t('perf.goalOf', { v0: l.label })}
              onChange={(e) => set(i, { target: e.target.value })}
            />
            <span className={styles.cfgWeight}>
              <Input
                inputMode="numeric"
                value={l.weight}
                aria-label={t('perf.weightOf', { v0: l.label })}
                onChange={(e) => set(i, { weight: e.target.value })}
              />
              <span className={styles.muted}>{share(l)}</span>
            </span>
            {l.auto ? (
              <span className={styles.muted}>{t('perf.fromErp')}</span>
            ) : bulk ? (
              <span className={styles.muted}>{t('perf.perPerson')}</span>
            ) : (
              <Input
                inputMode="decimal"
                value={l.actual}
                placeholder={t('perf.actual')}
                aria-label={t('perf.actualOf', { v0: l.label })}
                onChange={(e) => set(i, { actual: e.target.value })}
              />
            )}
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={t('perf.removeOf', { v0: l.label || t('perf.col.metrics') })}
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
                placeholder={t('perf.addAuto')}
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
            {t('perf.addManual')}
          </Button>
          <span className={styles.muted}>
            {lines.length}/{KPI_MAX_METRICS}
            {t('perf.minSep')} {KPI_MIN_METRICS}
            {t('perf.countSuffix')}
          </span>
        </div>
        <p className={styles.hint}>
          {t('perf.formula1')}
          {t('perf.formula2')}
          {lines.some((l) => !isKpiAutoKey(l.key)) && t('perf.manualNote')}
        </p>
        <label className={styles.cfgNote}>
          {t('perf.memo')}
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
