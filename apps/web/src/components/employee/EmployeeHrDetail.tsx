import { useCallback, useEffect, useState } from 'react';
import {
  ORG_UNIT_TYPE_LABEL,
  CHECKLIST_KIND_LABEL,
  EMPLOYEE_HISTORY_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  type ChecklistKind,
  type EmploymentType,
} from '@tongin/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { isHqUnit, useOrgUnits } from '../../lib/orgUnits';
import { useOptions } from '../../lib/useOptions';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Modal,
  RecordDetail,
  SegmentedControl,
  Select,
  useToast,
  type DetailItem,
} from '../ui';
import { BalanceCards, LeaveRequestTable, type LeaveBalance } from '../../pages/Leave';
import { MonthDays } from '../../pages/Attendance';
import astyles from '../approval/approval.module.css';
import styles from './employee.module.css';

export interface HrRecord {
  id: string;
  name: string;
  empNo: string | null;
  orgUnitId: string;
  positionId: string | null;
  phone: string | null;
  hireDate: string | null;
  isActive: boolean;
  birthDate: string | null;
  email: string | null;
  zipcode: string | null;
  addr: string | null;
  addrDetail: string | null;
  employmentType: EmploymentType;
  resignDate: string | null;
  resignReason: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  memo: string | null;
  position: { name: string } | null;
  orgUnit: { name: string; type: string } | null;
  concurrentOrgs: {
    orgUnitId: string;
    positionId: string | null;
    orgUnit: { name: string; type: string };
    position: { name: string } | null;
  }[];
  appUsers: { loginId: string; isActive: boolean }[];
  checklistItems: {
    id: string;
    kind: ChecklistKind;
    title: string;
    doneAt: string | null;
  }[];
  histories: {
    id: string;
    kind: string;
    effectiveDate: string;
    note: string | null;
    fromOrgName: string | null;
    toOrgName: string | null;
    fromPositionName: string | null;
    toPositionName: string | null;
  }[];
}

type Tab = 'info' | 'leave' | 'attendance' | 'history' | 'checklist';
const d10 = (v: string | null) => (v ? v.slice(0, 10) : null);

/**
 * 직원 인사기록 카드 — 기본·인사 정보 / 휴가 / 근태 / 발령 이력 / 입·퇴사 체크리스트.
 * 수정은 목록 화면의 수정 창(onEdit), 퇴사 처리는 여기서.
 */
export function EmployeeHrDetail({
  id,
  backLabel,
  onBack,
  onEdit,
  reloadKey,
}: {
  id: string;
  backLabel: string;
  onBack: () => void;
  onEdit: (rec: HrRecord) => void;
  /** 수정 창에서 저장하면 바뀌어 다시 읽는다 */
  reloadKey?: number;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const [rec, setRec] = useState<HrRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('info');
  const [resigning, setResigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRec(await api<HrRecord>(`/employees/${id}/hr`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const canEdit = can('EMPLOYEE.UPDATE');
  const tabs = [
    { value: 'info', label: '기본·인사' },
    ...(can('LEAVE.READ') ? [{ value: 'leave', label: '휴가' }] : []),
    ...(can('ATTENDANCE.READ') ? [{ value: 'attendance', label: '근태' }] : []),
    { value: 'history', label: '발령 이력' },
    { value: 'checklist', label: '입·퇴사 체크리스트' },
  ];

  const info: DetailItem[] = rec
    ? [
        { label: '직원명', value: rec.name },
        { label: '사번', value: rec.empNo },
        { label: '직책', value: rec.position?.name },
        { label: '소속', value: rec.orgUnit?.name },
        {
          label: '겸직',
          value: rec.concurrentOrgs.length
            ? rec.concurrentOrgs
                .map((c) => `${c.orgUnit.name}${c.position ? ` · ${c.position.name}` : ''}`)
                .join(', ')
            : null,
        },
        {
          label: '고용 형태',
          value: EMPLOYMENT_TYPE_LABEL[rec.employmentType] ?? rec.employmentType,
        },
        { label: '입사일', value: d10(rec.hireDate) },
        { label: '생년월일', value: d10(rec.birthDate) },
        { label: '연락처', value: rec.phone ? formatPhone(rec.phone) : null },
        { label: '이메일', value: rec.email },
        {
          label: '주소',
          wide: true,
          value: rec.addr
            ? `${rec.addr}${rec.addrDetail ? ` ${rec.addrDetail}` : ''}${rec.zipcode ? `(${rec.zipcode})` : ''}`
            : null,
        },
        {
          label: '비상 연락처',
          value: rec.emergencyName
            ? `${rec.emergencyName}${rec.emergencyRelation ? `(${rec.emergencyRelation})` : ''}${rec.emergencyPhone ? ` · ${formatPhone(rec.emergencyPhone)}` : ''}`
            : null,
        },
        {
          label: '계정',
          value: rec.appUsers.length
            ? rec.appUsers
                .map((u) => `${u.loginId}${u.isActive ? '' : ' (로그인 막힘)'}`)
                .join(', ')
            : '계정 없음',
        },
        {
          label: '상태',
          value: rec.resignDate ? (
            <Badge variant="subtle" color="neutral">
              퇴사 {d10(rec.resignDate)}
              {rec.resignReason ? ` · ${rec.resignReason}` : ''}
            </Badge>
          ) : (
            <Badge variant="subtle" color={rec.isActive ? 'success' : 'neutral'}>
              {rec.isActive ? '재직' : '비활성'}
            </Badge>
          ),
        },
        { label: '메모', wide: true, value: rec.memo },
      ]
    : [];

  return (
    <>
      <RecordDetail
        loading={loading && !rec}
        title={rec ? rec.name : '직원을 찾을 수 없습니다'}
        backLabel={backLabel}
        onBack={onBack}
        actions={
          rec && canEdit ? (
            <>
              {!rec.resignDate && (
                <Button variant="outline" size="sm" onClick={() => setResigning(true)}>
                  퇴사 처리
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => onEdit(rec)}>
                수정
              </Button>
            </>
          ) : undefined
        }
        sections={[]}
      >
        {rec && (
          <>
            <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)} options={tabs} />
            {tab === 'info' && (
              <section className="rd-card">
                <dl className="rd-grid">
                  {info.map((it) => (
                    <div key={it.label} className={`rd-item${it.wide ? ' rd-wide' : ''}`}>
                      <dt>{it.label}</dt>
                      <dd>
                        {it.value === null || it.value === undefined || it.value === '' ? (
                          <span className="rd-empty">-</span>
                        ) : (
                          it.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {tab === 'info' && canEdit && !rec.resignDate && (
              <ConcurrentOrgs rec={rec} onChanged={setRec} />
            )}
            {tab === 'leave' && <EmployeeLeave employeeId={rec.id} />}
            {tab === 'attendance' && <MonthDays employeeId={rec.id} />}
            {tab === 'history' && <History rec={rec} />}
            {tab === 'checklist' && (
              <Checklist rec={rec} canEdit={canEdit} onChanged={() => void load()} />
            )}
          </>
        )}
      </RecordDetail>
      {resigning && rec && (
        <ResignModal
          rec={rec}
          onClose={() => setResigning(false)}
          onDone={(next) => {
            setResigning(false);
            setRec(next);
            setTab('checklist');
          }}
        />
      )}
    </>
  );
}

/**
 * 겸직(추가 소속) — TF·프로젝트팀처럼 주 소속 외의 조직에도 함께 속한다.
 * 그 조직의 메뉴·공지·팀 업무를 함께 받고, 조직도 그 상자에도 '겸직'으로 나온다.
 * 결재선(팀장 찾기)·근태는 주 소속 기준이다.
 */
function ConcurrentOrgs({ rec, onChanged }: { rec: HrRecord; onChanged: (r: HrRecord) => void }) {
  const toast = useToast();
  const { units } = useOrgUnits();
  const positions = useOptions('/positions', 'name', 'id', (r) => r.isActive !== false);
  const [orgId, setOrgId] = useState('');
  const [posId, setPosId] = useState('');
  const [busy, setBusy] = useState(false);
  const taken = new Set([rec.orgUnitId, ...rec.concurrentOrgs.map((c) => c.orgUnitId)]);
  const orgOptions = units
    .filter((u) => isHqUnit(u) && u.isActive && !taken.has(u.id))
    .map((u) => ({
      value: u.id,
      label: u.name,
      description: (ORG_UNIT_TYPE_LABEL as Record<string, string>)[u.type] ?? u.type,
    }));

  const run = async (fn: () => Promise<HrRecord>, done: string) => {
    setBusy(true);
    try {
      onChanged(await fn());
      toast({ type: 'success', title: done });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    run(async () => {
      const r = await api<HrRecord>(`/employees/${rec.id}/concurrent-orgs`, {
        method: 'POST',
        body: JSON.stringify({ orgUnitId: orgId, positionId: posId || null }),
      });
      setOrgId('');
      setPosId('');
      return r;
    }, '겸직을 더했습니다');
  const remove = (c: HrRecord['concurrentOrgs'][number]) => {
    if (!window.confirm(`${c.orgUnit.name} 겸직을 해제할까요?`)) return;
    void run(
      () =>
        api<HrRecord>(`/employees/${rec.id}/concurrent-orgs/${c.orgUnitId}`, {
          method: 'DELETE',
        }),
      '겸직을 해제했습니다',
    );
  };

  return (
    <section className="rd-card">
      <h3 className="rd-title">겸직(추가 소속)</h3>
      <p className={styles.muted} style={{ margin: '0 0 12px' }}>
        TF·프로젝트팀처럼 다른 조직에도 함께 속하면 더하세요. 그 조직의 메뉴·공지·팀 업무를 함께
        받습니다. 결재선과 근태는 주 소속({rec.orgUnit?.name ?? '-'}) 기준입니다.
      </p>
      {rec.concurrentOrgs.length > 0 && (
        <ul className={styles.concurrentList}>
          {rec.concurrentOrgs.map((c) => (
            <li key={c.orgUnitId}>
              <b>{c.orgUnit.name}</b>
              <span className={styles.muted}>{c.position?.name ?? '직책 없음'}</span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(c)}>
                해제
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.concurrentAdd}>
        <Select
          value={orgId}
          placeholder="조직 고르기"
          onValueChange={setOrgId}
          options={orgOptions}
        />
        <Select
          value={posId}
          placeholder="그 조직 직책(선택)"
          onValueChange={setPosId}
          options={positions}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={!orgId}
          onClick={() => void add()}
        >
          겸직 더하기
        </Button>
      </div>
    </section>
  );
}

function EmployeeLeave({ employeeId }: { employeeId: string }) {
  const [data, setData] = useState<{
    balance: LeaveBalance;
    requests: Parameters<typeof LeaveRequestTable>[0]['rows'];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ balance: LeaveBalance; requests: Parameters<typeof LeaveRequestTable>[0]['rows'] }>(
      `/leave/employees/${employeeId}`,
    )
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : '불러오지 못했습니다'));
  }, [employeeId]);
  if (error) return <p className={styles.muted}>{error}</p>;
  if (!data) return null;
  return (
    <>
      <BalanceCards b={data.balance} />
      <LeaveRequestTable rows={data.requests} />
    </>
  );
}

function History({ rec }: { rec: HrRecord }) {
  if (!rec.histories.length)
    return (
      <p className={styles.muted}>
        발령 이력이 없습니다 — 이제부터 소속·직책을 바꾸거나 퇴사 처리하면 자동으로 남습니다.
      </p>
    );
  const desc = (h: HrRecord['histories'][number]) => {
    if (h.kind === 'TRANSFER') return `${h.fromOrgName ?? '-'} → ${h.toOrgName ?? '-'}`;
    if (h.kind === 'POSITION')
      return `${h.fromPositionName ?? '직책 없음'} → ${h.toPositionName ?? '직책 없음'}`;
    if (h.kind === 'JOIN')
      return [h.toOrgName, h.toPositionName].filter(Boolean).join(' · ') || '-';
    if (h.kind === 'CONCURRENT_ADD')
      return [h.toOrgName, h.toPositionName].filter(Boolean).join(' · ') || '-';
    if (h.kind === 'CONCURRENT_END')
      return [h.fromOrgName, h.fromPositionName].filter(Boolean).join(' · ') || '-';
    if (h.kind === 'RESIGN')
      return [h.fromOrgName, h.fromPositionName].filter(Boolean).join(' · ') || '-';
    return '-';
  };
  return (
    <section className="rd-card">
      <ol className={styles.history}>
        {rec.histories.map((h) => (
          <li key={h.id}>
            <span className={styles.histDate}>{d10(h.effectiveDate)}</span>
            <Badge variant="subtle" color={h.kind === 'RESIGN' ? 'neutral' : 'info'}>
              {EMPLOYEE_HISTORY_LABEL[h.kind] ?? h.kind}
            </Badge>
            <span>{desc(h)}</span>
            {h.note && <span className={styles.muted}>· {h.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Checklist({
  rec,
  canEdit,
  onChanged,
}: {
  rec: HrRecord;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const toggle = async (itemId: string, done: boolean) => {
    try {
      await api(`/employees/${rec.id}/checklist-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ done }),
      });
      onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '바꾸지 못했습니다' });
    }
  };
  const open = async (kind: ChecklistKind) => {
    try {
      await api(`/employees/${rec.id}/checklist/${kind}`, { method: 'POST' });
      onChanged();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
    }
  };

  return (
    <div className={styles.checkCols}>
      {(['ONBOARD', 'OFFBOARD'] as ChecklistKind[]).map((kind) => {
        const items = rec.checklistItems.filter((i) => i.kind === kind);
        const done = items.filter((i) => i.doneAt).length;
        return (
          <section key={kind} className="rd-card">
            <h3 className="rd-title">
              {CHECKLIST_KIND_LABEL[kind]} 체크리스트{' '}
              {items.length > 0 && (
                <span className={styles.muted}>
                  {done}/{items.length}
                </span>
              )}
            </h3>
            {items.length === 0 ? (
              <div className={styles.muted}>
                {kind === 'OFFBOARD' && !rec.resignDate
                  ? '퇴사 처리하면 퇴사 체크리스트가 생깁니다.'
                  : '아직 체크리스트가 없습니다.'}
                {canEdit && (kind === 'ONBOARD' || rec.resignDate) && (
                  <Button size="sm" variant="outline" onClick={() => void open(kind)}>
                    기본 항목 펼치기
                  </Button>
                )}
              </div>
            ) : (
              <ul className={styles.checkList}>
                {items.map((i) => (
                  <li key={i.id}>
                    <label className={styles.checkItem}>
                      <Checkbox
                        checked={!!i.doneAt}
                        disabled={!canEdit}
                        onCheckedChange={(v) => void toggle(i.id, v === true)}
                      />
                      <span className={i.doneAt ? styles.done : ''}>{i.title}</span>
                      {i.doneAt && <span className={styles.muted}>{i.doneAt.slice(0, 10)}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ResignModal({
  rec,
  onClose,
  onDone,
}: {
  rec: HrRecord;
  onClose: () => void;
  onDone: (next: HrRecord) => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const next = await api<HrRecord>(`/employees/${rec.id}/resign`, {
        method: 'POST',
        body: JSON.stringify({ resignDate: date, reason: reason.trim() || undefined }),
      });
      toast({ type: 'success', title: '퇴사 처리했습니다 — 퇴사 체크리스트를 확인하세요' });
      onDone(next);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${rec.name} 퇴사 처리`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} disabled={!date} onClick={() => void save()}>
            퇴사 처리
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <p className={styles.muted}>
          재직이 해제되고, 연결된 로그인 계정
          {rec.appUsers.length ? `(${rec.appUsers.map((u) => u.loginId).join(', ')})` : ''}은
          로그인할 수 없게 됩니다. 퇴사 이력과 퇴사 체크리스트가 생깁니다.
        </p>
        <label className={astyles.fieldLabel}>
          퇴사일
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={astyles.fieldLabel}>
          사유
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 개인 사유, 계약 만료"
          />
        </label>
      </div>
    </Modal>
  );
}
