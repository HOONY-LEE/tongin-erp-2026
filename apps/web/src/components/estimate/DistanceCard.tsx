import { useState } from 'react';
import { Map as MapIcon, Settings } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { Button, Input, Modal, useToast } from '../ui';
import { RouteMapModal, formatDuration } from './RouteMap';
import type { DistanceRule, EstimateDetailData } from './types';
import styles from './estimate.module.css';

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
  const { can } = useAuth();
  const toast = useToast();
  const [mapOpen, setMapOpen] = useState(false);
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
      toast({ type: 'success', title: '거리 할증 기준을 저장했습니다' });
      setRuleOpen(false);
      onRuleSaved?.();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={[styles.distCard, compact ? styles.distCompact : ''].join(' ')}>
      <div className={styles.distMain}>
        <span className={styles.infoLabel}>이사 거리</span>
        {km != null ? (
          <span className={styles.distValue}>
            <b>{km.toLocaleString()} km</b>
            {data.durationMin != null && <span> · 약 {formatDuration(data.durationMin)}</span>}
            <span className={styles.distSrc}>
              {data.distanceSource === 'KAKAO' ? '도로 기준' : '직선 추정'}
            </span>
          </span>
        ) : (
          <span className={styles.distEmpty}>
            {hasAddr ? '주소로 위치를 찾지 못했습니다' : '출발지·도착지 주소를 넣으면 계산됩니다'}
          </span>
        )}
      </div>
      <div className={styles.distFee}>
        <span className={styles.infoLabel}>거리 할증(예상)</span>
        <span className={styles.distValue}>
          <b>{fee.toLocaleString()}원</b>
          <span className={styles.distSrc}>
            {over > 0
              ? `${rule.freeKm}km 초과 ${over}km × ${rule.perKm.toLocaleString()}원`
              : `${rule.freeKm}km까지 할증 없음`}
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
          지도
        </Button>
        {can('COMMON_CODE.UPDATE') && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="거리 할증 기준"
            title="거리 할증 기준"
            onClick={() => {
              setForm({ freeKm: String(rule.freeKm), perKm: String(rule.perKm) });
              setRuleOpen(true);
            }}
          >
            <Settings size={14} />
          </Button>
        )}
      </div>

      <RouteMapModal estimateId={data.id} open={mapOpen} onClose={() => setMapOpen(false)} />
      <Modal
        open={ruleOpen}
        onOpenChange={(o) => !o && setRuleOpen(false)}
        title="거리 할증 기준"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleOpen(false)}>
              취소
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void saveRule()}>
              저장
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="무료 거리(km)"
            inputMode="numeric"
            value={form.freeKm}
            onChange={(e) => setForm((f) => ({ ...f, freeKm: e.target.value.replace(/\D/g, '') }))}
          />
          <Input
            label="넘는 1km마다(원)"
            inputMode="numeric"
            value={form.perKm}
            onChange={(e) => setForm((f) => ({ ...f, perKm: e.target.value.replace(/\D/g, '') }))}
          />
          <div style={{ fontSize: 13, color: 'var(--ark-color-text-secondary)' }}>
            예: 30km · 3,000원이면 45km 이사는 15km × 3,000원 = 45,000원(천 원 단위 반올림).
          </div>
        </div>
      </Modal>
    </div>
  );
}
