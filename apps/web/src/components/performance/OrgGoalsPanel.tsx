import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DUTY_CYCLE_LABEL, type DutyView, type KpiResult } from '@tongin/shared';
import { api } from '../../lib/api';
import { Badge } from '../ui';
import { fmtKpi } from '../../lib/kpiFormat';
import styles from '../../pages/performance.module.css';

/**
 * 조직관리 > 조직 상세 아래 — 그 조직의 역할·이번 분기 목표(성과 지표)·업무분장.
 * 업무분장·성과 평가 화면으로 바로 갈 수 있게 잇는다. 성과 지표는 인사 조회 권한이 있을 때만 보인다.
 */
export function OrgGoalsPanel({ orgId }: { orgId: string }) {
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
          <h3 className={styles.blockTitle}>역할</h3>
          <Link className={styles.goalLink} to={`/duties?tab=org&org=${orgId}`}>
            업무분장에서 정하기 <ArrowRight size={13} />
          </Link>
        </div>
        <p className={mission ? styles.goalText : styles.muted}>
          {mission ?? '아직 정한 역할이 없습니다.'}
        </p>
      </section>

      {kpi !== 'none' && (
        <section className={styles.block}>
          <div className={styles.goalHead}>
            <h3 className={styles.blockTitle}>
              이번 분기 목표{' '}
              {kpi?.grade && (
                <Badge variant="subtle" size="sm">
                  종합 {kpi.score}점 · {kpi.grade}
                </Badge>
              )}
            </h3>
            <Link className={styles.goalLink} to={`/performance?scope=ORG&id=${orgId}`}>
              성과 평가에서 보기 <ArrowRight size={13} />
            </Link>
          </div>
          {kpi ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>지표</th>
                  <th className={styles.num}>목표</th>
                  <th className={styles.num}>실적</th>
                  <th className={styles.num}>달성률</th>
                  <th className={styles.num}>반영</th>
                </tr>
              </thead>
              <tbody>
                {kpi.metrics.map((m) => {
                  const w = kpi.metrics.reduce((t, x) => t + x.weight, 0);
                  return (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td className={styles.num}>{fmtKpi(m.target, m.unit)}</td>
                      <td className={styles.num}>{fmtKpi(m.actual, m.unit)}</td>
                      <td className={styles.num}>
                        {m.achievement === null ? '—' : `${Math.round(m.achievement)}%`}
                      </td>
                      <td className={styles.num}>
                        {w ? `${Math.round((m.weight / w) * 100)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>불러오는 중…</p>
          )}
        </section>
      )}

      <section className={styles.block}>
        <div className={styles.goalHead}>
          <h3 className={styles.blockTitle}>업무분장 {duties?.length ?? ''}개</h3>
          <Link className={styles.goalLink} to={`/duties?tab=org&org=${orgId}`}>
            업무분장에서 보기 <ArrowRight size={13} />
          </Link>
        </div>
        {duties === null ? (
          <p className={styles.muted}>불러오는 중…</p>
        ) : duties.length ? (
          <ul className={styles.dutyList}>
            {duties.map((d) => (
              <li key={d.id}>
                <span className={styles.dutyTitle}>{d.title}</span>
                {d.ownerName && <span className={styles.muted}>{d.ownerName}</span>}
                <span className={styles.muted}>{DUTY_CYCLE_LABEL[d.cycle]}</span>
                {d.inProgress > 0 && (
                  <Badge variant="subtle" color="warning" size="sm">
                    진행 중 {d.inProgress}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>아직 정한 업무분장이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
