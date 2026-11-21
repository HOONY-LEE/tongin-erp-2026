import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SearchInput } from '../components/ui/SearchInput';
import { useSearchParams } from 'react-router-dom';
import { Settings2, Users } from 'lucide-react';
import {
  KPI_CATALOG,
  kpiPeriodOf,
  kpiPeriodOptions,
  type DutyView,
  type KpiGrade,
  type KpiResolved,
  type KpiResult,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { fmtKpi } from '../lib/kpiFormat';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  ListToolbar,
  Modal,
  PageHeader,
  PageSkeleton,
  SegmentedControl,
  Select,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { RadarChart, type RadarDatum } from '../components/performance/RadarChart';
import { KpiConfigModal } from '../components/performance/KpiConfigModal';
import styles from './performance.module.css';
import { DUTY_CYCLE_LABEL } from '../i18n/codes';

interface Overview {
  period: string;
  canEdit: boolean;
  orgs: KpiResult[];
  people: KpiResult[];
}
interface Detail {
  period: string;
  canEdit: boolean;
  result: KpiResult;
  members: {
    id: string;
    name: string;
    sub: string | null;
    score: number | null;
    grade: KpiGrade | null;
  }[];
  duties: DutyView[];
}

const GRADE_COLOR: Record<KpiGrade, 'success' | 'primary' | 'info' | 'warning' | 'error'> = {
  S: 'success',
  A: 'primary',
  B: 'info',
  C: 'warning',
  D: 'error',
};
const SOURCE_LABEL = {
  OWN: i18n.t('perf.src.OWN'),
  ORG: i18n.t('perf.src.ORG'),
  DEFAULT: i18n.t('perf.src.DEFAULT'),
} as const;

const radarOf = (metrics: KpiResolved[]): RadarDatum[] =>
  metrics.map((m) => ({
    key: m.key,
    short: m.short,
    value: m.achievement === null ? null : Math.min(100, m.achievement),
    caption: m.achievement === null ? i18n.t('perf.noData') : `${Math.round(m.achievement)}%`,
  }));

function GradeBadge({ r }: { r: Pick<KpiResult, 'score' | 'grade'> }) {
  const { t } = useTranslation();
  if (r.score === null || !r.grade) return <span className={styles.muted}>{t('perf.noData')}</span>;
  return (
    <span className={styles.gradeRow}>
      <b className={styles.score}>{r.score}</b>
      <Badge color={GRADE_COLOR[r.grade]} size="sm">
        {r.grade}
      </Badge>
    </span>
  );
}

function MetricChips({ metrics }: { metrics: KpiResolved[] }) {
  return (
    <span className={styles.chips}>
      {metrics.map((m) => (
        <span key={m.key} className={`${styles.chip} ${m.auto ? '' : styles.chipManual}`}>
          {m.short}
        </span>
      ))}
    </span>
  );
}

/**
 * 성과 평가 — 조직·개인 지표를 다각형(레이더)으로.
 * 조직별: 본사 부서·TF(또는 지점) 카드 · 개인별: 직원 표(내보내기) · 상세: 다각형 + 지표별 달성률 + 업무분장.
 * 주소: ?tab=org|person &group=HQ|BRANCH &period=2026-Q4 &scope=ORG|EMPLOYEE&id=…(상세)
 */
export default function Performance() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'person' ? 'person' : 'org';
  const group = params.get('group') === 'BRANCH' ? 'BRANCH' : 'HQ';
  const period = params.get('period') ?? kpiPeriodOf();
  const detailScope = params.get('scope') === 'EMPLOYEE' ? 'EMPLOYEE' : 'ORG';
  const detailId = params.get('id');
  const setParam = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) n.delete(k);
          else n.set(k, v);
        }
        return n;
      },
      { replace: !('id' in patch) },
    );

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  // 여러 명에게 한꺼번에 — 대상 고르기(조직·직접) → 지표 구성 창
  const [bulkPick, setBulkPick] = useState(false);
  const [bulk, setBulk] = useState<{ ids: string[]; label: string; template: KpiResult } | null>(
    null,
  );
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Overview>(`/kpi?period=${period}&group=${group}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('perf.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [period, group, toast, touch]);
  useEffect(() => {
    if (!detailId) void load();
  }, [load, detailId]);

  const periodSelect = (
    <div style={{ width: 150 }}>
      <Select
        value={period}
        onValueChange={(v) => setParam({ period: v })}
        options={kpiPeriodOptions(8)}
      />
    </div>
  );

  if (detailId)
    return (
      <PerformanceDetail
        scope={detailScope}
        id={detailId}
        period={period}
        periodSelect={periodSelect}
        onBack={() => setParam({ scope: null, id: null })}
        onOpen={(scope, id) => setParam({ scope, id })}
      />
    );

  const q = query.trim();
  const orgs = (data?.orgs ?? []).filter((o) => !q || o.name.includes(q));
  const people = data?.people ?? [];

  const tabs = (
    <SegmentedControl
      value={tab}
      onChange={(v) => setParam({ tab: v })}
      options={[
        { value: 'org', label: t('perf.view.org') },
        { value: 'person', label: t('perf.view.person') },
      ]}
    />
  );
  const groupSwitch = (
    <SegmentedControl
      value={group}
      onChange={(v) => setParam({ group: v })}
      options={[
        { value: 'HQ', label: t('perf.hq') },
        { value: 'BRANCH', label: t('perf.branch') },
      ]}
    />
  );

  const columns: Column[] = [
    { title: t('perf.col.name'), dataIndex: 'name', width: 110 },
    { title: t('perf.col.org'), dataIndex: 'orgUnitName', width: 130 },
    { title: t('perf.col.position'), dataIndex: 'sub', width: 90 },
    {
      title: t('perf.col.metrics'),
      flex: 1,
      minWidth: 200,
      render: (r) => <MetricChips metrics={(r as unknown as KpiResult).metrics} />,
      exportValue: (r) => (r as unknown as KpiResult).metrics.map((m) => m.label).join(', '),
    },
    {
      title: t('perf.col.setup'),
      width: 90,
      render: (r) => SOURCE_LABEL[(r as unknown as KpiResult).source],
    },
    {
      title: t('perf.col.score'),
      width: 100,
      numeric: true,
      render: (r) => {
        const x = r as unknown as KpiResult;
        return x.score === null ? (
          <span className={styles.muted}>{t('perf.noData')}</span>
        ) : (
          <b>{x.score}</b>
        );
      },
      exportValue: (r) => (r as unknown as KpiResult).score,
    },
    {
      title: t('perf.col.grade'),
      width: 70,
      render: (r) => {
        const g = (r as unknown as KpiResult).grade;
        return g ? (
          <Badge color={GRADE_COLOR[g]} size="sm">
            {g}
          </Badge>
        ) : (
          '—'
        );
      },
      exportValue: (r) => (r as unknown as KpiResult).grade,
    },
  ];

  return (
    <div className={`list-page ${tab === 'person' ? 'fit' : ''}`}>
      <PageHeader
        title={t('perf.title')}
        subtitle={t('perf.subtitle')}
        onRefresh={load}
        updatedAt={updatedAt}
        actions={periodSelect}
      />
      {tab === 'org' ? (
        <>
          <div className="dt-wrap">
            <ListToolbar
              search={
                <SearchInput value={query} onChange={setQuery} placeholder={t('perf.findOrg')} />
              }
              filters={groupSwitch}
              tabs={tabs}
            />
          </div>
          {loading && !data ? (
            <PageSkeleton cards={4} />
          ) : (
            <div className={styles.cardGrid}>
              {orgs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={styles.orgCard}
                  onClick={() => setParam({ scope: 'ORG', id: o.id })}
                >
                  <RadarChart data={radarOf(o.metrics)} size={190} />
                  <span className={styles.orgInfo}>
                    <span className={styles.orgHead}>
                      <b className={styles.orgName}>{o.name}</b>
                      <span className={styles.members}>
                        <Users size={13} /> {o.memberCount ?? 0}
                        {t('perf.peopleSuffix')}
                      </span>
                    </span>
                    <span className={styles.sourceText}>{SOURCE_LABEL[o.source]}</span>
                    <MetricChips metrics={o.metrics} />
                    <span className={styles.orgFoot}>
                      <span>{t('perf.overall')}</span>
                      <GradeBadge r={o} />
                    </span>
                  </span>
                </button>
              ))}
              {!orgs.length && <div className={styles.empty}>{t('perf.noOrgs')}</div>}
            </div>
          )}
        </>
      ) : (
        <DataTable
          columns={columns}
          rows={people as unknown as Row[]}
          loading={loading}
          fit
          exportable
          exportFileName={t('perf.exportName', { v0: period })}
          filters={groupSwitch}
          tabs={tabs}
          toolbarActions={
            data?.canEdit ? (
              <Button variant="primary" size="sm" onClick={() => setBulkPick(true)}>
                {t('perf.bulkSet')}
              </Button>
            ) : undefined
          }
          onRowClick={(r) => setParam({ scope: 'EMPLOYEE', id: String(r.id) })}
        />
      )}
      {bulkPick && data && (
        <BulkTargetModal
          orgs={data.orgs}
          people={people}
          onClose={() => setBulkPick(false)}
          onNext={(ids, label) => {
            const template = people.find((x) => x.id === ids[0]);
            setBulkPick(false);
            if (template) setBulk({ ids, label, template });
          }}
        />
      )}
      {bulk && (
        <KpiConfigModal
          scope="EMPLOYEE"
          scopeId={bulk.ids[0]}
          name={bulk.label}
          period={period}
          catalog={KPI_CATALOG}
          current={bulk.template}
          bulk={{ scopeIds: bulk.ids }}
          onClose={() => setBulk(null)}
          onSaved={() => {
            setBulk(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/** 한꺼번에 정할 직원 고르기 — 소속 조직 전체 또는 직접(조직별 묶음 체크) */
function BulkTargetModal({
  orgs,
  people,
  onClose,
  onNext,
}: {
  orgs: KpiResult[];
  people: KpiResult[];
  onClose: () => void;
  onNext: (ids: string[], label: string) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'org' | 'pick'>('org');
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const orgMembers = people.filter((p) => p.orgUnitId === orgId);
  const groups = useMemo(() => {
    const by = new Map<string, KpiResult[]>();
    for (const p of people) {
      if (q.trim() && !p.name.includes(q.trim()) && !(p.orgUnitName ?? '').includes(q.trim()))
        continue;
      const k = p.orgUnitName ?? t('perf.noOrg');
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    return [...by.entries()];
  }, [people, q]);
  const toggle = (ids: string[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const ids = mode === 'org' ? orgMembers.map((p) => p.id) : [...picked];
  const label =
    mode === 'org'
      ? t('perf.orgMembers', { v0: orgs.find((o) => o.id === orgId)?.name ?? '', v1: ids.length })
      : t('perf.pickedN', { v0: ids.length });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t('perf.bulkPick')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('perf.cancel')}
          </Button>
          <Button variant="primary" disabled={!ids.length} onClick={() => onNext(ids, label)}>
            {t('perf.nextOpen')}
            {ids.length}
            {t('perf.peopleClose')}
          </Button>
        </>
      }
    >
      <div className={styles.bulk}>
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as 'org' | 'pick')}
          options={[
            { value: 'org', label: t('perf.wholeOrg') },
            { value: 'pick', label: t('perf.pickManually') },
          ]}
        />
        {mode === 'org' ? (
          <>
            <Select
              value={orgId}
              onValueChange={setOrgId}
              options={orgs.map((o) => ({
                value: o.id,
                label: t('perf.orgCount', {
                  v0: o.name,
                  v1: people.filter((p) => p.orgUnitId === o.id).length,
                }),
              }))}
            />
            <p className={styles.hint}>
              {orgMembers.length
                ? orgMembers.map((p) => p.name).join(', ')
                : t('perf.noDirectMembers')}
            </p>
          </>
        ) : (
          <>
            <SearchInput value={q} onChange={setQ} placeholder={t('perf.findNameOrg')} />
            <div className={styles.pickList}>
              {groups.map(([org, list]) => {
                const all = list.every((p) => picked.has(p.id));
                return (
                  <div key={org} className={styles.pickGroup}>
                    <Checkbox
                      checked={all}
                      label={`${org} (${list.length})`}
                      onCheckedChange={(c) =>
                        toggle(
                          list.map((p) => p.id),
                          c === true,
                        )
                      }
                    />
                    <div className={styles.pickPeople}>
                      {list.map((p) => (
                        <Checkbox
                          key={p.id}
                          checked={picked.has(p.id)}
                          label={`${p.name}${p.sub ? ` ${p.sub}` : ''}`}
                          onCheckedChange={(c) => toggle([p.id], c === true)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className={styles.hint}>
          {t('perf.bulkHint1')}
          {t('perf.bulkHint2')}
        </p>
      </div>
    </Modal>
  );
}

function PerformanceDetail({
  scope,
  id,
  period,
  periodSelect,
  onBack,
  onOpen,
}: {
  scope: 'ORG' | 'EMPLOYEE';
  id: string;
  period: string;
  periodSelect: React.ReactNode;
  onBack: () => void;
  onOpen: (scope: 'ORG' | 'EMPLOYEE', id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/kpi/${scope}/${id}?period=${period}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('perf.loadFailed') });
    }
  }, [scope, id, period, toast, touch]);
  useEffect(() => {
    setD(null);
    void load();
  }, [load]);

  const insight = useMemo(() => {
    const ms = (d?.result.metrics ?? []).filter((m) => m.achievement !== null);
    if (!ms.length) return null;
    const sorted = [...ms].sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0));
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if ((worst.achievement ?? 0) >= 100)
      return t('perf.insightAll', { v0: best.label, v1: Math.round(best.achievement ?? 0) });
    return t('perf.insightWorst', {
      v0: worst.label,
      v1: Math.round(worst.achievement ?? 0),
      v2: best.label,
      v3: Math.round(best.achievement ?? 0),
    });
  }, [d]);

  if (!d) return <PageSkeleton cards={2} />;
  const r = d.result;
  const missing = r.metrics.filter((m) => m.achievement === null).length;

  return (
    <div className={styles.detail}>
      <PageHeader
        title={r.name}
        breadcrumbs={[{ label: t('perf.title'), onClick: onBack }]}
        hideBreadcrumbs
        subtitle={
          scope === 'EMPLOYEE'
            ? `${r.orgUnitName ?? ''}${r.sub ? ` · ${r.sub}` : ''}`
            : t('perf.membersN', { v0: r.memberCount ?? d.members.length })
        }
        tags={
          <>
            {r.grade && (
              <Badge color={GRADE_COLOR[r.grade]} size="sm">
                {t('perf.overall')} {r.score}
                {t('perf.pointsSep')} {r.grade}
              </Badge>
            )}
            <Badge variant="subtle" color="neutral" size="sm">
              {SOURCE_LABEL[r.source]}
            </Badge>
          </>
        }
        onRefresh={load}
        updatedAt={updatedAt}
        actions={
          <>
            {periodSelect}
            {d.canEdit && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Settings2 size={14} />}
                onClick={() => setEditing(true)}
              >
                {t('perf.configure')}
              </Button>
            )}
          </>
        }
      />

      <div className={styles.detailTop}>
        <section className={styles.radarCard}>
          <RadarChart data={radarOf(r.metrics)} size={320} />
          <div className={styles.legend}>
            <span>
              <i className={styles.legendTarget} /> {t('perf.goal100')}
            </span>
            <span>
              <i className={styles.legendActual} /> {t('perf.achievement')}
            </span>
          </div>
        </section>
        <section className={styles.tableCard}>
          <DataTable
            bare
            pageSize={0}
            rowKey="key"
            columns={[
              {
                title: t('perf.col.metrics'),
                dataIndex: 'label',
                render: (r) => <b title={String(r.source ?? '')}>{String(r.label)}</b>,
              },
              {
                title: t('perf.kind'),
                dataIndex: 'auto',
                render: (r) => (
                  <Badge variant="subtle" color={r.auto ? 'info' : 'warning'} size="sm">
                    {r.auto ? t('perf.auto') : t('perf.manual')}
                  </Badge>
                ),
              },
              {
                title: t('perf.actual'),
                dataIndex: 'actual',
                numeric: true,
                render: (r) => fmtKpi(r.actual as number | null, String(r.unit)),
              },
              {
                title: t('perf.goal'),
                dataIndex: 'target',
                numeric: true,
                render: (r) => fmtKpi(r.target as number | null, String(r.unit)),
              },
              { title: t('perf.weight'), dataIndex: 'weight', numeric: true },
              {
                title: t('perf.achievement'),
                dataIndex: 'achievement',
                flex: 1,
                minWidth: 160,
                render: (r) => {
                  const a = r.achievement as number | null;
                  return a === null ? (
                    <span className={styles.muted}>
                      {r.auto ? t('perf.noData') : t('perf.noActual')}
                    </span>
                  ) : (
                    <span className={styles.barRow}>
                      <span className={styles.bar}>
                        <span
                          className={`${styles.barFill} ${a >= 100 ? styles.barOk : a < 60 ? styles.barLow : ''}`}
                          style={{ width: `${Math.min(100, a)}%` }}
                        />
                      </span>
                      <b>{Math.round(a)}%</b>
                    </span>
                  );
                },
              },
            ]}
            rows={r.metrics as unknown as Row[]}
          />
          {insight && <p className={styles.insight}>{insight}</p>}
          {missing > 0 && (
            <p className={styles.hint}>
              {t('perf.excluded1')} {missing}
              {t('perf.excluded2')}
              {r.source !== 'OWN' &&
                (scope === 'EMPLOYEE' ? t('perf.followsOrg') : t('perf.isDefault'))}
            </p>
          )}
          {r.note && (
            <p className={styles.hint}>
              {t('perf.memoColon')} {r.note}
            </p>
          )}
        </section>
      </div>

      {scope === 'ORG' && d.members.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>
            {t('perf.members')} {d.members.length}
            {t('perf.peopleSuffix')}
          </h3>
          <div className={styles.memberGrid}>
            {d.members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={styles.member}
                onClick={() => onOpen('EMPLOYEE', m.id)}
              >
                <span>
                  <b>{m.name}</b>
                  {m.sub && <span className={styles.muted}> {m.sub}</span>}
                </span>
                <GradeBadge r={m} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>
          {scope === 'EMPLOYEE' ? t('perf.duties') : t('perf.orgDuties')} {d.duties.length}
          {t('perf.countSuffix')}
        </h3>
        {d.duties.length ? (
          <ul className={styles.dutyList}>
            {d.duties.map((duty) => (
              <li key={duty.id}>
                <span className={styles.dutyTitle}>{duty.title}</span>
                {scope === 'EMPLOYEE' && (
                  <Badge
                    variant="subtle"
                    color={duty.ownerEmpId === id ? 'primary' : 'neutral'}
                    size="sm"
                  >
                    {duty.ownerEmpId === id ? t('perf.primary') : t('perf.backup')}
                  </Badge>
                )}
                {scope === 'ORG' && duty.ownerName && (
                  <span className={styles.muted}>{duty.ownerName}</span>
                )}
                <span className={styles.muted}>{DUTY_CYCLE_LABEL[duty.cycle]}</span>
                {duty.inProgress > 0 && (
                  <Badge variant="subtle" color="warning" size="sm">
                    {t('perf.inProgress')} {duty.inProgress}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t('perf.noDuties')}</p>
        )}
      </section>

      {editing && (
        <KpiConfigModal
          scope={scope}
          scopeId={id}
          name={r.name}
          period={period}
          catalog={KPI_CATALOG}
          current={r}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
