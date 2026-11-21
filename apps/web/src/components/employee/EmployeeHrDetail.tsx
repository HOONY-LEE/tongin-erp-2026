import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { type ChecklistKind, type EmploymentType } from '@tongin/shared';
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
import { EmployeeAvatar } from './EmployeeAvatar';
import { PhotoCropModal } from './PhotoCropModal';
import { primeEmployeePhoto } from '../../lib/employeePhoto';
import { Camera } from 'lucide-react';
import {
  CHECKLIST_KIND_LABEL,
  EMPLOYEE_HISTORY_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  ORG_UNIT_TYPE_LABEL,
} from '../../i18n/codes';
import { DatePicker } from '../ui';

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
  /** 프로필 사진이 바뀐 시각(없으면 사진 없음) */
  photoAt: string | null;
  position: { name: string } | null;
  orgUnit: { name: string; type: string } | null;
  concurrentOrgs: {
    orgUnitId: string;
    positionId: string | null;
    orgUnit: { name: string; type: string };
    position: { name: string } | null;
  }[];
  appUsers: { loginId: string; isActive: boolean; userRoles: { role: { name: string } }[] }[];
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
  const { t } = useTranslation();
  const toast = useToast();
  const { can, user } = useAuth();
  const [rec, setRec] = useState<HrRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('info');
  const [resigning, setResigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRec(await api<HrRecord>(`/employees/${id}/hr`));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('employees.loadFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const canEdit = can('EMPLOYEE.UPDATE');
  /** 사진은 인사 수정 권한이 있거나 본인이면 바꿀 수 있다 */
  const canPhoto = canEdit || (!!user?.employeeId && user.employeeId === id);
  const [cropOpen, setCropOpen] = useState(false);

  const savePhoto = async (data: string, previewUrl: string) => {
    const r = await api<{ photoAt: string }>(`/employees/${id}/photo`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
    primeEmployeePhoto(id, r.photoAt, previewUrl);
    setRec((cur) => (cur ? { ...cur, photoAt: r.photoAt } : cur));
    toast({ type: 'success', title: t('employees.photoSaved') });
  };
  const removePhoto = async () => {
    try {
      await api(`/employees/${id}/photo`, { method: 'DELETE' });
      primeEmployeePhoto(id, null);
      setRec((cur) => (cur ? { ...cur, photoAt: null } : cur));
      toast({ type: 'success', title: t('employees.photoDeleted') });
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('employees.deleteFailed'),
      });
    }
  };
  const tabs = [
    { value: 'info', label: t('employees.tab.info') },
    ...(can('LEAVE.READ') ? [{ value: 'leave', label: t('employees.tab.leave') }] : []),
    ...(can('ATTENDANCE.READ')
      ? [{ value: 'attendance', label: t('employees.tab.attendance') }]
      : []),
    { value: 'history', label: t('employees.tab.history') },
    { value: 'checklist', label: t('employees.tab.checklist') },
  ];

  const statusBadge = rec ? (
    rec.resignDate ? (
      <Badge variant="subtle" color="neutral">
        {t('employees.resigned')} {d10(rec.resignDate)}
        {rec.resignReason ? ` · ${rec.resignReason}` : ''}
      </Badge>
    ) : (
      <Badge variant="subtle" color={rec.isActive ? 'success' : 'neutral'}>
        {rec.isActive ? t('employees.active') : t('employees.inactive')}
      </Badge>
    )
  ) : null;
  const roles = rec
    ? [...new Set(rec.appUsers.flatMap((u) => u.userRoles.map((r) => r.role.name)))]
    : [];

  // 프로필 항목 — 이름 · ID · 사번 · 입사일 · 고용 형태 · 연락처 · 직책 · 소속 · 상태 · 주소 · 이메일 · 메모 · 권한
  const info: DetailItem[] = rec
    ? [
        { label: t('employees.f.name'), value: rec.name },
        {
          label: 'ID',
          value: rec.appUsers.length
            ? rec.appUsers
                .map((u) => `${u.loginId}${u.isActive ? '' : t('employees.loginBlocked')}`)
                .join(', ')
            : t('employees.noAccount'),
        },
        { label: t('employees.empNo'), value: rec.empNo },
        { label: t('employees.hireDate'), value: d10(rec.hireDate) },
        {
          label: t('employees.employmentType'),
          value: EMPLOYMENT_TYPE_LABEL[rec.employmentType] ?? rec.employmentType,
        },
        { label: t('employees.phone'), value: rec.phone ? formatPhone(rec.phone) : null },
        { label: t('employees.position'), value: rec.position?.name },
        { label: t('employees.f.org'), value: rec.orgUnit?.name },
        { label: t('employees.status'), value: statusBadge },
        {
          label: t('employees.address'),
          wide: true,
          value: rec.addr
            ? `${rec.addr}${rec.addrDetail ? ` ${rec.addrDetail}` : ''}${rec.zipcode ? `(${rec.zipcode})` : ''}`
            : null,
        },
        { label: t('employees.email'), value: rec.email },
        { label: t('employees.memo'), wide: true, value: rec.memo },
        {
          label: t('employees.f.roles'),
          wide: true,
          value: roles.length ? (
            <span className={styles.roles}>
              {roles.map((r) => (
                <Badge key={r} variant="subtle" color="neutral">
                  {r}
                </Badge>
              ))}
            </span>
          ) : null,
        },
        {
          label: t('employees.concurrent'),
          value: rec.concurrentOrgs.length
            ? rec.concurrentOrgs
                .map((c) => `${c.orgUnit.name}${c.position ? ` · ${c.position.name}` : ''}`)
                .join(', ')
            : null,
        },
        { label: t('employees.birthDate'), value: d10(rec.birthDate) },
        {
          label: t('employees.f.emergency'),
          value: rec.emergencyName
            ? `${rec.emergencyName}${rec.emergencyRelation ? `(${rec.emergencyRelation})` : ''}${rec.emergencyPhone ? ` · ${formatPhone(rec.emergencyPhone)}` : ''}`
            : null,
        },
      ]
    : [];

  return (
    <>
      <RecordDetail
        loading={loading && !rec}
        title={rec ? rec.name : t('employees.notFound')}
        backLabel={backLabel}
        onBack={onBack}
        actions={
          rec && canEdit ? (
            <>
              {!rec.resignDate && (
                <Button variant="outline" size="sm" onClick={() => setResigning(true)}>
                  {t('employees.resign')}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => onEdit(rec)}>
                {t('employees.editBtn')}
              </Button>
            </>
          ) : undefined
        }
        sections={[]}
      >
        {rec && (
          <>
            <section className={`rd-card ${styles.profile}`}>
              <div className={styles.photoWrap}>
                <EmployeeAvatar id={rec.id} name={rec.name} photoAt={rec.photoAt} size={88} />
                {canPhoto && (
                  <button
                    type="button"
                    className={styles.photoEdit}
                    onClick={() => setCropOpen(true)}
                    aria-label={t('employees.changePhoto')}
                    title={t('employees.changePhoto')}
                  >
                    <Camera size={14} />
                  </button>
                )}
              </div>
              <div className={styles.profileText}>
                <b>
                  {rec.name} {statusBadge}
                </b>
                <span>
                  {[rec.position?.name, rec.orgUnit?.name].filter(Boolean).join(' · ') || '-'}
                </span>
                {canPhoto && (
                  <div className={styles.photoActions}>
                    <Button variant="outline" size="sm" onClick={() => setCropOpen(true)}>
                      {rec.photoAt ? t('employees.photoChange') : t('employees.photoUpload')}
                    </Button>
                    {rec.photoAt && (
                      <Button variant="ghost" size="sm" onClick={() => void removePhoto()}>
                        {t('employees.photoDelete')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </section>
            <PhotoCropModal open={cropOpen} onClose={() => setCropOpen(false)} onSave={savePhoto} />
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
 * 그 조직의 메뉴·공지·작업관리를 함께 받고, 조직도 그 상자에도 '겸직'으로 나온다.
 * 결재선(팀장 찾기)·근태는 주 소속 기준이다.
 */
function ConcurrentOrgs({ rec, onChanged }: { rec: HrRecord; onChanged: (r: HrRecord) => void }) {
  const { t } = useTranslation();
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
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('employees.saveFailed'),
      });
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
    }, t('employees.concAdded'));
  const remove = (c: HrRecord['concurrentOrgs'][number]) => {
    if (!window.confirm(t('employees.concRemoveQ', { v0: c.orgUnit.name }))) return;
    void run(
      () =>
        api<HrRecord>(`/employees/${rec.id}/concurrent-orgs/${c.orgUnitId}`, {
          method: 'DELETE',
        }),
      t('employees.concRemoved'),
    );
  };

  return (
    <section className="rd-card">
      <h3 className="rd-title">{t('employees.concTitle')}</h3>
      <p className={styles.muted} style={{ margin: '0 0 12px' }}>
        {t('employees.concHelp1')}
        {t('employees.concHelp2')}
        {rec.orgUnit?.name ?? '-'}
        {t('employees.concHelp3')}
      </p>
      {rec.concurrentOrgs.length > 0 && (
        <ul className={styles.concurrentList}>
          {rec.concurrentOrgs.map((c) => (
            <li key={c.orgUnitId}>
              <b>{c.orgUnit.name}</b>
              <span className={styles.muted}>{c.position?.name ?? t('employees.noPosition')}</span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(c)}>
                {t('employees.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.concurrentAdd}>
        <Select
          value={orgId}
          placeholder={t('employees.pickOrg')}
          onValueChange={setOrgId}
          options={orgOptions}
        />
        <Select
          value={posId}
          placeholder={t('employees.pickPosition')}
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
          {t('employees.concAdd')}
        </Button>
      </div>
    </section>
  );
}

function EmployeeLeave({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation();
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
      .catch((e) => setError(e instanceof ApiError ? e.message : t('employees.loadFailed')));
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
  const { t } = useTranslation();
  if (!rec.histories.length) return <p className={styles.muted}>{t('employees.noHistory')}</p>;
  const desc = (h: HrRecord['histories'][number]) => {
    if (h.kind === 'TRANSFER') return `${h.fromOrgName ?? '-'} → ${h.toOrgName ?? '-'}`;
    if (h.kind === 'POSITION')
      return `${h.fromPositionName ?? t('employees.noPosition')} → ${h.toPositionName ?? t('employees.noPosition')}`;
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
  const { t } = useTranslation();
  const toast = useToast();
  const toggle = async (itemId: string, done: boolean) => {
    try {
      await api(`/employees/${rec.id}/checklist-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ done }),
      });
      onChanged();
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('employees.changeFailed'),
      });
    }
  };
  const open = async (kind: ChecklistKind) => {
    try {
      await api(`/employees/${rec.id}/checklist/${kind}`, { method: 'POST' });
      onChanged();
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('employees.createFailed'),
      });
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
              {CHECKLIST_KIND_LABEL[kind]} {t('employees.checklist')}{' '}
              {items.length > 0 && (
                <span className={styles.muted}>
                  {done}/{items.length}
                </span>
              )}
            </h3>
            {items.length === 0 ? (
              <div className={styles.muted}>
                {kind === 'OFFBOARD' && !rec.resignDate
                  ? t('employees.checklistOffHint')
                  : t('employees.checklistNone')}
                {canEdit && (kind === 'ONBOARD' || rec.resignDate) && (
                  <Button size="sm" variant="outline" onClick={() => void open(kind)}>
                    {t('employees.checklistSeed')}
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
  const { t } = useTranslation();
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
      toast({ type: 'success', title: t('employees.resignDone') });
      onDone(next);
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('employees.processFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('employees.resignTitle', { v0: rec.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('employees.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!date} onClick={() => void save()}>
            {t('employees.resign')}
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <p className={styles.muted}>
          {t('employees.resignHelp1')}
          {rec.appUsers.length ? `(${rec.appUsers.map((u) => u.loginId).join(', ')})` : ''}
          {t('employees.resignHelp2')}
          {t('employees.resignHelp3')}
        </p>
        <label className={astyles.fieldLabel}>
          {t('employees.resignDate')}
          <DatePicker value={date} onChange={(v) => setDate(v)} />
        </label>
        <label className={astyles.fieldLabel}>
          {t('employees.reason')}
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('employees.reasonPh')}
          />
        </label>
      </div>
    </Modal>
  );
}
