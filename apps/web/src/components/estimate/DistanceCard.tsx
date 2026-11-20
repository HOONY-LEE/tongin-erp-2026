import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useState } from 'react';
import { Map as MapIcon, Settings } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { Button, Input, Modal, useToast } from '../ui';
import type { DistanceRule, EstimateDetailData } from './types';
import styles from './estimate.module.css';
import { fs } from '../../lib/fontScale';

// 지도(leaflet)는 무겁다 — '지도' 버튼을 처음 누를 때 받는다
const RouteMapModal = lazy(() => import('./RouteMap').then((m) => ({ default: m.RouteMapModal })));

export const formatDuration = (min: number | null) =>
  min == null
    ? null
    : min >= 60
      ? i18n.t('est.dur.hm', { v0: Math.floor(min / 60), v1: min % 60 })
      : i18n.t('est.dur.m', { v0: min });

/** 거리 할증 — 무료 거리를 넘는 km × km당 금액(천 원 단위 반올림) */
export function distanceSurcharge(km: number | null, rule: DistanceRule) {
  if (km == null) return 0;
  const over = Math.max(0, Math.ceil(km - rule.freeKm));
  return Math.round((over * rule.perKm) / 1000) * 1000;
}

/**
 * 이사 거리 — 출발지·도착지 주소로 잰 도로 거리·예상 소요와 거리 할증 예상액.
 * 지도 버튼은 두 주소를 경로로 이어 보여 주고, 관리자는 할증 기준(무료 거리·km당 금액)을 고칠 수 있다.
 */
export function DistanceCard({
  data,
  onRuleSaved,
  compact,
}: {
  data: EstimateDetailData;
  onRuleSaved?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [mapOpen, setMapOpen] = useState(false);
  // 한 번 연 뒤로는 계속 붙여 둔다(닫힘 애니메이션이 끊기지 않게)
  const [mapUsed, setMapUsed] = useState(false);
  if (mapOpen && !mapUsed) setMapUsed(true);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [form, setForm] = useState({ freeKm: '', perKm: '' });
  const [saving, setSaving] = useState(false);

  const rule = data.distanceRule;
  const km = data.distanceKm == null ? null : Number(data.distanceKm);
  const hasAddr = !!data.fromAddr && !!data.toAddr;
  const fee = distanceSurcharge(km, rule);
  const over = km == null ? 0 : Math.max(0, Math.ceil(km - rule.freeKm));

  const saveRule = async () => {
    setSaving(true);
    try {
      await api('/estimates/distance-rule', {
        method: 'PUT',
        body: JSON.stringify({
          freeKm: Math.round(Number(form.freeKm) || 0),
          perKm: Math.round(Number(form.perKm.replace(/,/g, '')) || 0),
        }),
      });
      toast({ type: 'success', title: t('est.distSaved') });
      setRuleOpen(false);
      onRuleSaved?.();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('est.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={[styles.distCard, compact ? styles.distCompact : ''].join(' ')}>
      <div className={styles.distMain}>
        <span className={styles.infoLabel}>{t('est.distance')}</span>
        {km != null ? (
          <span className={styles.distValue}>
            <b>{km.toLocaleString()} km</b>
            {data.durationMin != null && (
              <span>
                {' '}
                {t('est.approx')} {formatDuration(data.durationMin)}
              </span>
            )}
            <span className={styles.distSrc}>
              {data.distanceSource === 'KAKAO' ? t('est.byRoad') : t('est.straight')}
            </span>
          </span>
        ) : (
          <span className={styles.distEmpty}>{hasAddr ? t('est.geoFail') : t('est.geoNeed')}</span>
        )}
      </div>
      <div className={styles.distFee}>
        <span className={styles.infoLabel}>{t('est.distFee')}</span>
        <span className={styles.distValue}>
          <b>{fee.toLocaleString()}원</b>
          <span className={styles.distSrc}>
            {over > 0
              ? t('est.distRule', { v0: rule.freeKm, v1: over, v2: rule.perKm.toLocaleString() })
              : t('est.distFree', { v0: rule.freeKm })}
          </span>
        </span>
      </div>
      <div className={styles.distActions}>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<MapIcon size={14} />}
          disabled={!hasAddr}
          onClick={() => setMapOpen(true)}
        >
          {t('est.map')}
        </Button>
        {can('COMMON_CODE.UPDATE') && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('est.distRuleTitle')}
            title={t('est.distRuleTitle')}
            onClick={() => {
              setForm({ freeKm: String(rule.freeKm), perKm: String(rule.perKm) });
              setRuleOpen(true);
            }}
          >
            <Settings size={14} />
          </Button>
        )}
      </div>

      {mapUsed && (
        <Suspense fallback={null}>
          <RouteMapModal estimateId={data.id} open={mapOpen} onClose={() => setMapOpen(false)} />
        </Suspense>
      )}
      <Modal
        open={ruleOpen}
        onOpenChange={(o) => !o && setRuleOpen(false)}
        title={t('est.distRuleTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleOpen(false)}>
              {t('est.cancel')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void saveRule()}>
              {t('est.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label={t('est.freeKm')}
            inputMode="numeric"
            value={form.freeKm}
            onChange={(e) => setForm((f) => ({ ...f, freeKm: e.target.value.replace(/\D/g, '') }))}
          />
          <Input
            label={t('est.perKm')}
            inputMode="numeric"
            value={form.perKm}
            onChange={(e) => setForm((f) => ({ ...f, perKm: e.target.value.replace(/\D/g, '') }))}
          />
          <div style={{ fontSize: fs(13), color: 'var(--ark-color-text-secondary)' }}>
            {t('est.distExample')}
          </div>
        </div>
      </Modal>
    </div>
  );
}
