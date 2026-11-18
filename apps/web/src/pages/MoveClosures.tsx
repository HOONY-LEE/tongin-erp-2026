import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useOrgScope } from '../lib/useOrgScope';
import { useAuth } from '../auth/AuthContext';
import { Button, Input, ListPage, Modal, Select, useToast } from '../components/ui';
import {
  monthGrid,
  shiftMonth,
  thisMonth,
  today,
  useClosures,
  type Closure,
} from '../components/closure/useClosures';
import styles from './moveClosures.module.css';

/**
 * 이사일 마감 캘린더 — 지점별로 그날 더 받을 수 없는 날을 표시·관리한다.
 * 상담 콘솔의 작은 달력에서 [자세히]로 새 창으로 연다. 날짜를 누르면 그날 마감을 걸고 푼다.
 */
export default function MoveClosures() {
  const toast = useToast();
  const { can } = useAuth();
  const { options, ownOrgId, unrestricted } = useOrgScope();
  const [ym, setYm] = useState(thisMonth);
  const { data, reload } = useClosures(ym);
  const [day, setDay] = useState<string | null>(null);
  const [orgId, setOrgId] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const t = today();
  const editable = can('LEAD.UPDATE');

  const closuresOf = (d: string) => data?.closures.filter((x) => x.date === d) ?? [];
  const leadsOf = (d: string) => data?.counts.find((x) => x.date === d)?.leads ?? 0;

  const open = (d: string) => {
    setDay(d);
    setOrgId(unrestricted ? 'ALL' : ownOrgId);
    setMemo('');
  };
  const add = async () => {
    if (!day) return;
    setBusy(true);
    try {
      await api('/move-closures', {
        method: 'POST',
        body: JSON.stringify({
          date: day,
          orgUnitId: orgId && orgId !== 'ALL' ? orgId : null,
          memo: memo || undefined,
        }),
      });
      setMemo('');
      await reload();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '마감하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: Closure) => {
    setBusy(true);
    try {
      await api(`/move-closures/${c.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '마감을 풀지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const [y, m] = ym.split('-').map(Number);
  const orgOptions = [
    ...(unrestricted ? [{ value: 'ALL', label: '전체(모든 지점)' }] : []),
    ...options.filter((o) => !o.disabled),
  ];

  return (
    <ListPage
      title="이사일 마감"
      subtitle="지점별로 그날 더 받을 수 없는 날을 표시합니다. 상담 콘솔 달력과 접수 상담 때 참고합니다. 날짜를 누르면 마감을 걸거나 풉니다."
      onRefresh={reload}
    >
      <div className={styles.head}>
        <Button variant="outline" size="sm" onClick={() => setYm(shiftMonth(ym, -1))}>
          <ChevronLeft size={14} />
        </Button>
        <b>
          {y}년 {m}월
        </b>
        <Button variant="outline" size="sm" onClick={() => setYm(shiftMonth(ym, 1))}>
          <ChevronRight size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setYm(thisMonth())}>
          이번 달
        </Button>
      </div>
      <div className={styles.grid}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={`${styles.dow} ${i === 0 ? styles.sun : ''}`}>
            {d}
          </div>
        ))}
        {monthGrid(ym).map((c) => {
          const closed = closuresOf(c.date);
          const all = closed.some((x) => !x.orgUnitId);
          const leads = leadsOf(c.date);
          return (
            <button
              key={c.date}
              type="button"
              className={[
                styles.day,
                !c.inMonth && styles.out,
                c.date === t && styles.today,
                all && styles.allClosed,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => open(c.date)}
            >
              <span className={`${styles.num} ${c.dow === 0 ? styles.sun : ''}`}>
                {Number(c.date.slice(8))}
              </span>
              {leads > 0 && <span className={styles.leads}>이사 {leads}</span>}
              <span className={styles.chips}>
                {closed.slice(0, 4).map((x) => (
                  <span key={x.id} className={styles.chip} title={x.memo ?? undefined}>
                    {x.orgName ?? '전체 마감'}
                  </span>
                ))}
                {closed.length > 4 && <span className={styles.more}>+{closed.length - 4}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <Modal
        open={!!day}
        onOpenChange={(o) => !o && setDay(null)}
        title={
          day
            ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 마감 · 이사 ${leadsOf(day)}건`
            : ''
        }
      >
        {day && (
          <div className={styles.modal}>
            {closuresOf(day).length ? (
              <ul className={styles.list}>
                {closuresOf(day).map((c) => (
                  <li key={c.id}>
                    <b>{c.orgName ?? '전체(모든 지점)'}</b>
                    {c.memo && <span>{c.memo}</span>}
                    {editable && (
                      <button
                        type="button"
                        aria-label="마감 풀기"
                        disabled={busy}
                        onClick={() => void remove(c)}
                      >
                        <X size={14} /> 풀기
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>마감한 지점이 없습니다.</p>
            )}
            {editable && (
              <div className={styles.addRow}>
                <Select
                  value={orgId}
                  onValueChange={setOrgId}
                  options={orgOptions}
                  placeholder="지점"
                  aria-label="마감할 지점"
                />
                <Input
                  value={memo}
                  placeholder="메모(선택) — 예: 차량 마감"
                  maxLength={300}
                  onChange={(e) => setMemo(e.target.value)}
                />
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void add()}>
                  마감
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </ListPage>
  );
}
