import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Settings2, Users } from 'lucide-react';
import {
  DUTY_CYCLE_LABEL,
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
import {
  Badge,
  Button,
  DataTable,
  ListToolbar,
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
const SOURCE_LABEL = { OWN: '직접 구성', ORG: '조직 구성', DEFAULT: '기본 구성' } as const;

export const fmtKpi = (v: number | null, unit: string) => {
  if (v === null) return '—';
  if (unit === '원') return `${Math.round(v).toLocaleString('ko-KR')}원`;
  if (unit === '%') return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
  return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
};
const radarOf = (metrics: KpiResolved[]): RadarDatum[] =>
  metrics.map((m) => ({
    key: m.key,
    short: m.short,
    value: m.achievement === null ? null : Math.min(100, m.achievement),
    caption: m.achievement === null ? '자료 없음' : `${Math.round(m.achievement)}%`,
  }));

function GradeBadge({ r }: { r: Pick<KpiResult, 'score' | 'grade'> }) {
  if (r.score === null || !r.grade) return <span className={styles.muted}>자료 없음</span>;
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
 * 조직별: 본사 부서·TF(또는 지점) 카드 · 개인별: 직원 표(내보내기) · 상세: 다각형 + 지표별 달성률 + 업무 분장.
 * 주소: ?tab=org|person &group=HQ|BRANCH &period=2026-Q4 &scope=ORG|EMPLOYEE&id=…(상세)
 */
export default function Performance() {
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
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Overview>(`/kpi?period=${period}&group=${group}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
        { value: 'org', label: '조직별' },
        { value: 'person', label: '개인별' },
      ]}
    />
  );
  const groupSwitch = (
    <SegmentedControl
      value={group}
      onChange={(v) => setParam({ group: v })}
      options={[
        { value: 'HQ', label: '본사' },
        { value: 'BRANCH', label: '지점' },
      ]}
    />
  );

  const columns: Column[] = [
    { title: '이름', dataIndex: 'name', width: 110 },
    { title: '소속', dataIndex: 'orgUnitName', width: 130 },
    { title: '직책', dataIndex: 'sub', width: 90 },
    {
      title: '지표',
      flex: 1,
      minWidth: 200,
      render: (r) => <MetricChips metrics={(r as unknown as KpiResult).metrics} />,
      exportValue: (r) => (r as unknown as KpiResult).metrics.map((m) => m.label).join(', '),
    },
    {
      title: '구성',
      width: 90,
      render: (r) => SOURCE_LABEL[(r as unknown as KpiResult).source],
    },
    {
      title: '종합 점수',
      width: 100,
      numeric: true,
      render: (r) => {
        const x = r as unknown as KpiResult;
        return x.score === null ? (
          <span className={styles.muted}>자료 없음</span>
        ) : (
          <b>{x.score}</b>
        );
      },
      exportValue: (r) => (r as unknown as KpiResult).score,
    },
    {
      title: '등급',
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
        title="성과 평가"
        subtitle="조직·직원마다 지표 3~8개와 목표를 정하면, ERP 기록(계약·입금·작업·팀 업무·근태)과 직접 넣은 실적으로 달성률·종합 점수·등급(S~D)을 냅니다. 다각형 바깥 점선이 목표 100%입니다."
        onRefresh={load}
        updatedAt={updatedAt}
        actions={periodSelect}
      />
      {tab === 'org' ? (
        <>
          <div className="dt-wrap">
            <ListToolbar
              search={
                <div className="sft-toolbar__search-wrap">
                  <span className="sft-toolbar__search-icon" aria-hidden="true">
                    <Search size={15} />
                  </span>
                  <input
                    className="sft-toolbar__search"
                    type="search"
                    value={query}
                    placeholder="조직 찾기"
                    aria-label="조직 찾기"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
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
                        <Users size={13} /> {o.memberCount ?? 0}명
                      </span>
                    </span>
                    <span className={styles.sourceText}>{SOURCE_LABEL[o.source]}</span>
                    <MetricChips metrics={o.metrics} />
                    <span className={styles.orgFoot}>
                      <span>종합</span>
                      <GradeBadge r={o} />
                    </span>
                  </span>
                </button>
              ))}
              {!orgs.length && <div className={styles.empty}>조직이 없습니다</div>}
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
          exportFileName={`성과평가_${period}`}
          filters={groupSwitch}
          tabs={tabs}
          onRowClick={(r) => setParam({ scope: 'EMPLOYEE', id: String(r.id) })}
        />
      )}
    </div>
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
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/kpi/${scope}/${id}?period=${period}`));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      return `모든 지표가 목표를 넘었습니다. 특히 ${best.label}(${Math.round(best.achievement ?? 0)}%)이 좋습니다.`;
    return `${worst.label} 달성률이 ${Math.round(worst.achievement ?? 0)}%로 가장 낮습니다 — 먼저 챙길 곳입니다. ${best.label}은 ${Math.round(best.achievement ?? 0)}%.`;
  }, [d]);

  if (!d) return <PageSkeleton cards={2} />;
  const r = d.result;
  const missing = r.metrics.filter((m) => m.achievement === null).length;

  return (
    <div className={styles.detail}>
      <PageHeader
        title={r.name}
        breadcrumbs={[{ label: '성과 평가', onClick: onBack }]}
        hideBreadcrumbs
        subtitle={
          scope === 'EMPLOYEE'
            ? `${r.orgUnitName ?? ''}${r.sub ? ` · ${r.sub}` : ''}`
            : `구성원 ${r.memberCount ?? d.members.length}명`
        }
        tags={
          <>
            {r.grade && (
              <Badge color={GRADE_COLOR[r.grade]} size="sm">
                종합 {r.score}점 · {r.grade}
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
                지표 구성·실적 입력
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
              <i className={styles.legendTarget} /> 목표 100%
            </span>
            <span>
              <i className={styles.legendActual} /> 달성률
            </span>
          </div>
        </section>
        <section className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>지표</th>
                <th>구분</th>
                <th className={styles.num}>실적</th>
                <th className={styles.num}>목표</th>
                <th className={styles.num}>가중치</th>
                <th>달성률</th>
              </tr>
            </thead>
            <tbody>
              {r.metrics.map((m) => (
                <tr key={m.key}>
                  <td title={m.source}>
                    <b>{m.label}</b>
                  </td>
                  <td>
                    <Badge variant="subtle" color={m.auto ? 'info' : 'warning'} size="sm">
                      {m.auto ? '자동' : '직접'}
                    </Badge>
                  </td>
                  <td className={styles.num}>{fmtKpi(m.actual, m.unit)}</td>
                  <td className={styles.num}>{fmtKpi(m.target, m.unit)}</td>
                  <td className={styles.num}>{m.weight}</td>
                  <td>
                    {m.achievement === null ? (
                      <span className={styles.muted}>{m.auto ? '자료 없음' : '실적 미입력'}</span>
                    ) : (
                      <span className={styles.barRow}>
                        <span className={styles.bar}>
                          <span
                            className={`${styles.barFill} ${m.achievement >= 100 ? styles.barOk : m.achievement < 60 ? styles.barLow : ''}`}
                            style={{ width: `${Math.min(100, m.achievement)}%` }}
                          />
                        </span>
                        <b>{Math.round(m.achievement)}%</b>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {insight && <p className={styles.insight}>{insight}</p>}
          {missing > 0 && (
            <p className={styles.hint}>
              실적이 없는 지표 {missing}개는 종합 점수에서 뺐습니다.
              {r.source !== 'OWN' &&
                (scope === 'EMPLOYEE'
                  ? ' 지금은 소속 조직 구성(금액·건수 목표는 인원으로 나눔)을 따릅니다.'
                  : ' 지금은 기본 구성입니다.')}
            </p>
          )}
          {r.note && <p className={styles.hint}>메모: {r.note}</p>}
        </section>
      </div>

      {scope === 'ORG' && d.members.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>구성원 {d.members.length}명</h3>
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
          {scope === 'EMPLOYEE' ? '맡은 업무(업무 분장)' : '조직 업무 분장'} {d.duties.length}개
        </h3>
        {d.duties.length ? (
          <ul className={styles.dutyList}>
            {d.duties.map((t) => (
              <li key={t.id}>
                <span className={styles.dutyTitle}>{t.title}</span>
                {scope === 'EMPLOYEE' && (
                  <Badge
                    variant="subtle"
                    color={t.ownerEmpId === id ? 'primary' : 'neutral'}
                    size="sm"
                  >
                    {t.ownerEmpId === id ? '주' : '부'}
                  </Badge>
                )}
                {scope === 'ORG' && t.ownerName && (
                  <span className={styles.muted}>{t.ownerName}</span>
                )}
                <span className={styles.muted}>{DUTY_CYCLE_LABEL[t.cycle]}</span>
                {t.inProgress > 0 && (
                  <Badge variant="subtle" color="warning" size="sm">
                    진행 중 {t.inProgress}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>
            아직 정한 업무 분장이 없습니다(업무 분장 메뉴에서 정합니다).
          </p>
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
