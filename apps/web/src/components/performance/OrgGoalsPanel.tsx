import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { type DutyView, type KpiResult } from '@tongin/shared';
import { api } from '../../lib/api';
import { Badge, DataTable, type Row } from '../ui';
import { fmtKpi } from '../../lib/kpiFormat';
import styles from '../../pages/performance.module.css';
import { DUTY_CYCLE_LABEL } from '../../i18n/codes';

/**
 * 조직관리 > 조직 상세 아래 — 그 조직의 역할·이번 분기 목표(성과 지표)·업무분장.
 * 업무분장·성과 평가 화면으로 바로 갈 수 있게 잇는다. 성과 지표는 인사 조회 권한이 있을 때만 보인다.
 */
export function OrgGoalsPanel({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [mission, setMission] = useState<string | null>(null);
  const [duties, setDuties] = useState<DutyView[] | null>(null);
  const [kpi, setKpi] = useState<KpiResult | null | 'none'>(null);
  useEffect(() => {
    let alive = true;
    api<{ orgs: { id: string; mission: string | null }[]; duties: DutyView[] }>('/duties')
      .then((d) => {
        if (!alive) return;
        setMission(d.orgs.find((o) => o.id === orgId)?.mission ?? null);
        setDuties(d.duties.filter((x) => x.orgUnitId === orgId));
      })
      .catch(() => alive && setDuties([]));
    api<{ result: KpiResult }>(`/kpi/ORG/${orgId}`)
      .then((r) => alive && setKpi(r.result))
      .catch(() => alive && setKpi('none'));
    return () => {
      alive = false;
    };
  }, [orgId]);

  return (
    <div className={styles.goalPanel}>
      <section className={styles.block}>
        <div className={styles.goalHead}>
          <h3 className={styles.blockTitle}>{t('perf.role')}</h3>
          <Link className={styles.goalLink} to={`/duties?tab=org&org=${orgId}`}>
            {t('perf.setInDuties')} <ArrowRight size={13} />
          </Link>
        </div>
        <p className={mission ? styles.goalText : styles.muted}>{mission ?? t('perf.noRole')}</p>
      </section>

      {kpi !== 'none' && (
        <section className={styles.block}>
          <div className={styles.goalHead}>
            <h3 className={styles.blockTitle}>
              {t('perf.quarterGoals')}{' '}
              {kpi?.grade && (
                <Badge variant="subtle" size="sm">
                  {t('perf.overall')} {kpi.score}
                  {t('perf.pointsSep')} {kpi.grade}
                </Badge>
              )}
            </h3>
            <Link className={styles.goalLink} to={`/performance?scope=ORG&id=${orgId}`}>
              {t('perf.viewInPerf')} <ArrowRight size={13} />
            </Link>
          </div>
          {kpi ? (
            <DataTable
              bare
              pageSize={0}
              rowKey="key"
              columns={[
                { title: t('perf.col.metrics'), dataIndex: 'label', flex: 1 },
                {
                  title: t('perf.goal'),
                  dataIndex: 'target',
                  numeric: true,
                  render: (r) => fmtKpi(r.target as number | null, String(r.unit)),
                },
                {
                  title: t('perf.actual'),
                  dataIndex: 'actual',
                  numeric: true,
                  render: (r) => fmtKpi(r.actual as number | null, String(r.unit)),
                },
                {
                  title: t('perf.achievement'),
                  dataIndex: 'achievement',
                  numeric: true,
                  render: (r) =>
                    r.achievement === null ? '—' : `${Math.round(r.achievement as number)}%`,
                },
                {
                  title: t('perf.weightShort'),
                  dataIndex: 'weight',
                  numeric: true,
                  render: (r) => {
                    const w = kpi.metrics.reduce((t, x) => t + x.weight, 0);
                    return w ? `${Math.round(((r.weight as number) / w) * 100)}%` : '—';
                  },
                },
              ]}
              rows={kpi.metrics as unknown as Row[]}
            />
          ) : (
            <p className={styles.muted}>{t('perf.loading')}</p>
          )}
        </section>
      )}

      <section className={styles.block}>
        <div className={styles.goalHead}>
          <h3 className={styles.blockTitle}>
            {t('perf.dutiesShort')} {duties?.length ?? ''}
            {t('perf.countSuffix')}
          </h3>
          <Link className={styles.goalLink} to={`/duties?tab=org&org=${orgId}`}>
            {t('perf.viewInDuties')} <ArrowRight size={13} />
          </Link>
        </div>
        {duties === null ? (
          <p className={styles.muted}>{t('perf.loading')}</p>
        ) : duties.length ? (
          <ul className={styles.dutyList}>
            {duties.map((d) => (
              <li key={d.id}>
                <span className={styles.dutyTitle}>{d.title}</span>
                {d.ownerName && <span className={styles.muted}>{d.ownerName}</span>}
                <span className={styles.muted}>{DUTY_CYCLE_LABEL[d.cycle]}</span>
                {d.inProgress > 0 && (
                  <Badge variant="subtle" color="warning" size="sm">
                    {t('perf.inProgress')} {d.inProgress}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t('perf.noDutiesShort')}</p>
        )}
      </section>
    </div>
  );
}
