import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Eraser, Wand2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useOrgUnits } from '../lib/orgUnits';
import { autoAssign, branchColor, loadSigungu, type SigunguRegion } from '../lib/sigunguGeo';
import { Button, ConfirmModal, ListPage, SearchInput, Spinner, useToast } from '../components/ui';
import styles from './BranchTerritory.module.css';

const CLEAR = '__clear';
const UNASSIGNED = '#c7c7cc';

/**
 * 지점 담당 영역 — 시·군·구를 지점에 배정하는 지도.
 * 왼쪽에서 지점(붓)을 고르고 지도에서 구역을 누르면 그 지점으로 칠한다. [지우기]로 배정을 뺀다.
 * 붓 없이 구역을 누르면 그 구역의 지점을 붓으로 고른다. 저장해야 반영된다.
 * 상담 콘솔은 출발지 주소의 구역으로 담당 지점(마감 달력)을 자동으로 고른다.
 */
export default function BranchTerritory() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const editable = can('ORG_UNIT.UPDATE');
  const { units } = useOrgUnits();
  const branches = useMemo(
    () =>
      units
        .filter((u) => u.type === 'BRANCH' && u.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [units],
  );
  const colorOf = useMemo(
    () => new Map(branches.map((b, i) => [b.id, branchColor(i)])),
    [branches],
  );
  const nameOf = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const [regions, setRegions] = useState<SigunguRegion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 서버에 저장된 배정 / 지금 화면의 배정 */
  const [saved, setSaved] = useState<Map<string, string>>(new Map());
  const [assign, setAssign] = useState<Map<string, string>>(new Map());
  const [brush, setBrush] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [geo, rows] = await Promise.all([
        loadSigungu(),
        api<{ sido: string; sigungu: string; orgUnitId: string }[]>('/branch-territories'),
      ]);
      const m = new Map(rows.map((r) => [`${r.sido}|${r.sigungu}`, r.orgUnitId]));
      setRegions(geo);
      setSaved(m);
      setAssign(new Map(m));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** 바뀐 구역(저장 전) */
  const changes = useMemo(() => {
    if (!regions) return [];
    return regions
      .filter((r) => (assign.get(r.key) ?? null) !== (saved.get(r.key) ?? null))
      .map((r) => ({ sido: r.sido, sigungu: r.name, orgUnitId: assign.get(r.key) ?? null }));
  }, [regions, assign, saved]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const id of assign.values()) c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [assign]);

  // ── 지도 ──
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layers = useRef<Map<string, L.Polygon>>(new Map());
  // 지도 이벤트가 최신 값을 보도록
  const live = useRef({ brush, assign, editable });
  live.current = { brush, assign, editable };

  useEffect(() => {
    if (!regions || !box.current || mapRef.current) return;
    const map = L.map(box.current, { zoomControl: true, attributionControl: true, minZoom: 6 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 13,
      opacity: 0.5,
      attribution: '&copy; OpenStreetMap · 통계청 행정구역(2018)',
    }).addTo(map);
    const group = L.featureGroup().addTo(map);
    for (const r of regions) {
      const poly = L.polygon(r.polygons, { weight: 0.7, color: '#ffffff', fillOpacity: 0.55 });
      poly.on('click', () => {
        const { brush: b, assign: a, editable: ok } = live.current;
        if (!b || !ok) {
          setBrush(a.get(r.key) ?? null);
          return;
        }
        setAssign((prev) => {
          const next = new Map(prev);
          if (b === CLEAR) next.delete(r.key);
          else next.set(r.key, b);
          return next;
        });
      });
      poly.addTo(group);
      layers.current.set(r.key, poly);
    }
    map.fitBounds(group.getBounds(), { padding: [12, 12] });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layers.current.clear();
    };
  }, [regions]);

  // 색·툴팁을 배정에 맞춘다 — 붓으로 고른 지점은 진하게, 나머지는 옅게
  useEffect(() => {
    if (!regions) return;
    for (const r of regions) {
      const poly = layers.current.get(r.key);
      if (!poly) continue;
      const id = assign.get(r.key);
      const focus = !brush || brush === CLEAR || brush === id;
      poly.setStyle({
        fillColor: id ? (colorOf.get(id) ?? UNASSIGNED) : UNASSIGNED,
        fillOpacity: focus ? (brush && brush !== CLEAR ? 0.8 : 0.55) : 0.18,
        color: brush && brush === id ? '#111111' : '#ffffff',
        weight: brush && brush === id ? 1.4 : 0.7,
      });
      poly.unbindTooltip();
      poly.bindTooltip(
        `${r.sido} ${r.name} · ${id ? (nameOf.get(id) ?? t('terr.unknown')) : t('terr.none')}`,
        { sticky: true },
      );
    }
  }, [regions, assign, brush, colorOf, nameOf, t]);

  const save = async () => {
    if (!changes.length) return;
    setSaving(true);
    try {
      await api('/branch-territories', { method: 'PUT', body: JSON.stringify({ items: changes }) });
      setSaved(new Map(assign));
      toast({ type: 'success', title: t('terr.saved', { v0: changes.length }) });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('terr.saveFailed') });
    } finally {
      setSaving(false);
    }
  };
  const runAuto = () => {
    if (!regions) return;
    const next = autoAssign(regions, branches, assign);
    const filled = next.size - assign.size;
    setAssign(next);
    setAutoOpen(false);
    toast({ type: 'success', title: t('terr.autoDone', { v0: filled }) });
  };

  const shown = branches.filter((b) => !q.trim() || b.name.includes(q.trim()));
  const unassigned = regions ? regions.length - assign.size : 0;

  return (
    <ListPage
      fit
      title={t('terr.title')}
      subtitle={t('terr.sub')}
      actions={
        editable ? (
          <div className={styles.actions}>
            <Button variant="outline" size="sm" onClick={() => setAutoOpen(true)}>
              <Wand2 size={14} /> {t('terr.auto')}
            </Button>
            {changes.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setAssign(new Map(saved))}>
                {t('terr.revert')}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={!changes.length}
              loading={saving}
              onClick={() => void save()}
            >
              {changes.length ? t('terr.saveN', { v0: changes.length }) : t('terr.save')}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className={styles.body}>
        <aside className={styles.side}>
          <SearchInput value={q} onChange={setQ} placeholder={t('terr.findBranch')} />
          <div className={styles.summary}>
            {t('terr.summary', { v0: regions?.length ?? 0, v1: unassigned })}
          </div>
          <div className={styles.list}>
            {editable && (
              <button
                type="button"
                className={`${styles.item} ${brush === CLEAR ? styles.on : ''}`}
                onClick={() => setBrush(brush === CLEAR ? null : CLEAR)}
              >
                <Eraser size={13} className={styles.eraser} />
                <span className={styles.name}>{t('terr.clear')}</span>
              </button>
            )}
            {shown.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`${styles.item} ${brush === b.id ? styles.on : ''}`}
                onClick={() => setBrush(brush === b.id ? null : b.id)}
              >
                <i className={styles.dot} style={{ background: colorOf.get(b.id) }} />
                <span className={styles.name}>{b.name}</span>
                <span className={styles.count}>{counts.get(b.id) ?? 0}</span>
              </button>
            ))}
          </div>
          <p className={styles.hint}>{editable ? t('terr.hint') : t('terr.hintRead')}</p>
        </aside>
        <div className={styles.mapWrap}>
          {error ? (
            <div className={styles.center}>{error}</div>
          ) : !regions ? (
            <div className={styles.center}>
              <Spinner />
            </div>
          ) : null}
          <div ref={box} className={styles.map} />
        </div>
      </div>
      <ConfirmModal
        open={autoOpen}
        title={t('terr.auto')}
        message={t('terr.autoBody', { v0: unassigned })}
        confirmLabel={t('terr.autoRun')}
        onConfirm={runAuto}
        onClose={() => setAutoOpen(false)}
      />
    </ListPage>
  );
}
