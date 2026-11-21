import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { useOptions } from '../../lib/useOptions';
import { useDetailParam } from '../../lib/useDetailParam';
import {
  Badge,
  Button,
  DataTable,
  FilterButton,
  filterRows,
  Input,
  Modal,
  PasswordInput,
  RecordDetail,
  Select,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  PhoneInput,
} from '../../components/ui';
import styles from './access.module.css';
import { formatPhone } from '../../lib/phone';
import { DatePicker } from '../../components/ui';

interface AccountRole {
  roleId: string;
  roleName: string;
  dataScope: string;
  orgScopeId: string | null;
  orgScope: string | null;
}
interface Account {
  id: string;
  loginId: string;
  isActive: boolean;
  employeeId: string | null;
  /** 외부(전속업체) 계정이면 업체 이름 — 직원이 아니다 */
  partnerName: string | null;
  employeeName: string | null;
  orgUnitId: string | null;
  positionId: string | null;
  phone: string | null;
  empNo: string | null;
  hireDate: string | null;
  employeeActive: boolean | null;
  orgUnitName: string | null;
  positionName: string | null;
  roles: AccountRole[];
}
interface RoleOpt {
  id: string;
  name: string;
  permissions: string[];
  isSuperAdmin: boolean;
}
interface PositionOpt {
  id: string;
  name: string;
  isActive?: boolean;
  defaultRoleId: string | null;
}
interface Assign {
  roleId: string;
  dataScope: 'OWN' | 'ORG' | 'ALL';
  orgScopeId: string | null;
}

const SCOPE_LABEL: Record<string, string> = {
  OWN: i18n.t('acc.scope.OWN'),
  ORG: i18n.t('acc.scope.ORG'),
  ALL: i18n.t('acc.scope.ALL'),
};
const SCOPE_OPTIONS = [
  { value: 'ALL', label: i18n.t('acc.scope.ALL') },
  { value: 'ORG', label: i18n.t('acc.scopeOpt.ORG') },
  { value: 'OWN', label: i18n.t('acc.scopeOpt.OWN') },
];
const NONE = '__none__';
const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

/**
 * 계정 — 누가 어떤 권한 그룹을, 어느 데이터 범위로 갖는지.
 * 한 계정에 그룹을 여러 개 줄 수 있고(권한은 합쳐진다), 그룹마다 범위를 따로 정한다.
 * 예) 강남점장: '지점장' 그룹 · 소속 조직(강남점)
 */
export default function AccountList() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Account[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [positions, setPositions] = useState<PositionOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [resetting, setResetting] = useState<Account | null>(null);
  const { id: detailId, open: openDetail, close: closeDetail } = useDetailParam();
  const orgs = useOptions('/org-units', 'name');
  /** 검색 옆 필터 — 소속·직책·권한 그룹·상태·사용 */
  const [flt, setFlt] = useState<FilterValues>({});
  const isWildcard = user?.permissions.includes('*') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Account[]>('/accounts'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    // 그룹 권한 목록이 있어야 '내게 없는 권한이 든 그룹'을 흐리게 보여 줄 수 있다
    (can('ROLE.READ')
      ? api<RoleOpt[]>('/roles')
      : api<{ id: string; name: string }[]>('/accounts/roles').then((rs) =>
          rs.map((r) => ({ ...r, permissions: [], isSuperAdmin: false })),
        )
    )
      .then(setRoles)
      .catch(() => setRoles([]));
    api<PositionOpt[]>('/positions')
      .then(setPositions)
      .catch(() => setPositions([]));
  }, [load, can]);

  const toggleActive = async (r: Account) => {
    try {
      await api(`/accounts/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      toast({ type: 'success', title: r.isActive ? t('acc.deactivated') : t('acc.activated') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.saveFailed') });
    }
  };

  const roleText = (r: Account) =>
    r.roles.map((role) => role.roleName).join(', ') || t('acc.noRoles');
  const scopeText = (r: Account) =>
    r.roles
      .map(
        (role) =>
          `${SCOPE_LABEL[role.dataScope] ?? role.dataScope}${role.orgScope ? `(${role.orgScope})` : ''}`,
      )
      .join(', ') || '-';
  const statusText = (r: Account) =>
    r.partnerName
      ? t('acc.partner')
      : r.employeeActive === false
        ? t('acc.retired')
        : r.employeeName
          ? t('acc.active')
          : '-';

  // 정렬·검색이 되도록 화면에 보이는 값을 행에 펼쳐 둔다
  const tableRows = rows.map((r) => ({
    ...r,
    name: r.employeeName ?? r.partnerName ?? '',
    org: r.partnerName ? t('acc.partner') : (r.orgUnitName ?? ''),
    position: r.positionName ?? '',
    roleNames: roleText(r),
    scopes: scopeText(r),
    status: statusText(r),
    active: r.isActive ? t('acc.on') : t('acc.off'),
  }));

  const filterFields: FilterField[] = [
    {
      key: 'org',
      label: t('acc.flt.org'),
      type: 'multi',
      options: [...new Set(tableRows.map((r) => r.org).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ko'))
        .map((v) => ({ value: v, label: v })),
    },
    {
      key: 'positionId',
      label: t('acc.flt.position'),
      type: 'multi',
      options: positions.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      key: 'roleId',
      label: t('acc.flt.group'),
      type: 'multi',
      options: roles.map((r) => ({ value: r.id, label: r.name })),
    },
    {
      key: 'status',
      label: t('acc.flt.status'),
      type: 'single',
      options: [t('acc.active'), t('acc.retired'), t('acc.partner')].map((v) => ({
        value: v,
        label: v,
      })),
    },
    {
      key: 'isActive',
      label: t('acc.flt.active'),
      type: 'single',
      options: [
        { value: 'true', label: t('acc.on') },
        { value: 'false', label: t('acc.off') },
      ],
    },
  ];
  // 권한 그룹은 한 계정에 여러 개라 따로 — 고른 그룹 중 하나라도 있으면
  const pickedRoles = (flt.roleId as string[] | undefined) ?? [];
  const listed = filterRows(
    tableRows.filter(
      (r) => !pickedRoles.length || r.roles.some((x) => pickedRoles.includes(x.roleId)),
    ),
    filterFields.filter((f) => f.key !== 'roleId'),
    flt,
    (r, key) => (key === 'isActive' ? String(r.isActive) : r[key as keyof typeof r]),
  );

  const columns: Column[] = [
    { title: 'ID', dataIndex: 'loginId', width: 150 },
    { title: t('acc.col.name'), dataIndex: 'name', width: 110 },
    { title: t('acc.col.org'), dataIndex: 'org', minWidth: 120, flex: 1 },
    { title: t('acc.position'), dataIndex: 'position', width: 90 },
    { title: t('acc.groups'), dataIndex: 'roleNames', minWidth: 120, flex: 1 },
    { title: t('acc.col.scope'), dataIndex: 'scopes', minWidth: 120, flex: 1 },
    {
      title: t('acc.col.status'),
      dataIndex: 'status',
      width: 90,
      render: (r) => (
        <Badge variant="subtle" color={r.status === t('acc.retired') ? 'neutral' : 'info'}>
          {String(r.status)}
        </Badge>
      ),
    },
    {
      title: t('acc.col.active'),
      dataIndex: 'active',
      width: 100,
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {String(r.active)}
        </Badge>
      ),
    },
  ];

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;
  const modal = editing && (
    <AccountModal
      account={editing === 'new' ? null : editing}
      roles={roles}
      positions={positions}
      orgs={orgs}
      isWildcard={isWildcard}
      myPerms={user?.permissions ?? []}
      onClose={() => setEditing(null)}
      onSaved={async () => {
        setEditing(null);
        await load();
      }}
    />
  );

  if (detailId) {
    return (
      <>
        <RecordDetail
          loading={!detail && loading}
          title={
            detail
              ? `${detail.employeeName ?? detail.partnerName ?? detail.loginId}`
              : t('acc.notFound')
          }
          backLabel={t('acc.accounts')}
          onBack={closeDetail}
          actions={
            detail && can('USER.UPDATE') ? (
              <>
                {detail.id !== user?.userId && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setResetting(detail)}>
                      {t('acc.resetPw')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void toggleActive(detail)}>
                      {detail.isActive ? t('acc.deactivate') : t('acc.activate')}
                    </Button>
                  </>
                )}
                <Button variant="primary" size="sm" onClick={() => setEditing(detail)}>
                  {t('acc.edit')}
                </Button>
              </>
            ) : undefined
          }
          sections={
            detail
              ? [
                  {
                    title: detail.partnerName ? t('acc.partner') : t('acc.employeeInfo'),
                    items: detail.partnerName
                      ? [{ label: t('acc.vendor'), value: detail.partnerName }]
                      : [
                          { label: t('acc.col.name'), value: detail.employeeName },
                          { label: t('acc.empNo'), value: detail.empNo },
                          { label: t('acc.col.org'), value: detail.orgUnitName },
                          { label: t('acc.position'), value: detail.positionName },
                          {
                            label: t('acc.phone'),
                            value: detail.phone ? formatPhone(detail.phone) : null,
                          },
                          { label: t('acc.hireDate'), value: detail.hireDate },
                          { label: t('acc.col.status'), value: statusText(detail) },
                        ],
                  },
                  {
                    title: t('acc.login'),
                    items: [
                      { label: 'ID', value: detail.loginId },
                      {
                        label: t('acc.col.active'),
                        value: (
                          <Badge variant="subtle" color={detail.isActive ? 'success' : 'neutral'}>
                            {detail.isActive ? t('acc.on') : t('acc.off')}
                          </Badge>
                        ),
                      },
                    ],
                  },
                  {
                    title: t('acc.perms'),
                    items: detail.roles.length
                      ? detail.roles.map((role, i) => ({
                          label: `${role.roleName}${detail.roles.length > 1 ? ` (${i + 1})` : ''}`,
                          value: `${SCOPE_LABEL[role.dataScope] ?? role.dataScope}${role.orgScope ? ` · ${role.orgScope}` : ''}`,
                        }))
                      : [{ label: t('acc.groups'), value: t('acc.noRoles') }],
                  },
                ]
              : []
          }
        />
        {modal}
        {resetting && <ResetPasswordModal account={resetting} onClose={() => setResetting(null)} />}
      </>
    );
  }

  return (
    <>
      <DataTable
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        columns={columns}
        rows={listed as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => openDetail(String(r.id))}
        toolbarActions={
          can('USER.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              {t('acc.createBtn')}
            </Button>
          ) : undefined
        }
      />
      {modal}
    </>
  );
}

/**
 * 비밀번호 재설정(관리자) — 비밀번호를 잊은 직원 계정에 새 비밀번호를 정한다.
 * 새 비밀번호는 화면에서 본인에게 따로 알려 주고, 받은 사람은 '내 비밀번호 바꾸기'로 다시 바꾼다.
 */
function ResetPasswordModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const short = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 6 && confirm === password;

  const save = async () => {
    setSaving(true);
    try {
      await api(`/accounts/${account.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      });
      toast({
        type: 'success',
        title: t('acc.pwReset'),
      });
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.saveFailed') });
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('acc.resetTitle', {
        v0: account.employeeName ?? account.partnerName ?? account.loginId,
      })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('acc.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!canSubmit || saving}
            onClick={() => void save()}
          >
            {t('acc.resetBtn')}
          </Button>
        </>
      }
    >
      <div className={styles.section}>
        <span className={styles.hint}>
          {account.loginId} {t('acc.resetHelp')}
        </span>
        <PasswordInput
          label={t('acc.newPw')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('acc.min6')}
          autoComplete="new-password"
          showToggle
          fullWidth
          error={short ? t('acc.min6Err') : undefined}
        />
        <PasswordInput
          label={t('acc.newPw2')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          showToggle
          fullWidth
          error={mismatch ? t('acc.sameAsAbove') : undefined}
        />
      </div>
    </Modal>
  );
}

type IdCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'bad'; reason: string };

/**
 * 계정 생성 = 직원 등록. 직원 정보(이름·소속·직책) + 로그인 정보 + 권한 그룹을 한 번에 정한다.
 * 편집에서는 직원 정보와 권한 그룹을 고친다(연결된 직원이 없던 예전 계정은 저장할 때 직원이 만들어진다).
 */
function AccountModal({
  account,
  roles,
  positions,
  orgs,
  isWildcard,
  myPerms,
  onClose,
  onSaved,
}: {
  account: Account | null;
  roles: RoleOpt[];
  positions: PositionOpt[];
  orgs: { value: string; label: string }[];
  isWildcard: boolean;
  myPerms: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const isNew = !account;
  const [name, setName] = useState(account?.employeeName ?? '');
  const [orgUnitId, setOrgUnitId] = useState(account?.orgUnitId ?? '');
  const [positionId, setPositionId] = useState(account?.positionId ?? NONE);
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [hireDate, setHireDate] = useState(account ? (account.hireDate ?? '') : today());
  const [loginId, setLoginId] = useState('');
  const [idCheck, setIdCheck] = useState<IdCheck>({ state: 'idle' });
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [assigns, setAssigns] = useState<Assign[]>(
    account
      ? account.roles.map((r) => ({
          roleId: r.roleId,
          dataScope: r.dataScope as Assign['dataScope'],
          orgScopeId: r.orgScopeId,
        }))
      : [],
  );
  // 직책으로 자동으로 넣은 권한 — 사용자가 손대지 않았으면 직책·소속을 바꿀 때 따라 바뀐다
  const [autoAssign, setAutoAssign] = useState<Assign | null>(null);
  const [saving, setSaving] = useState(false);

  // 아이디 중복 확인 — 입력을 멈추면 바로 확인한다
  useEffect(() => {
    if (!isNew) return;
    const id = loginId.trim();
    if (!id) {
      setIdCheck({ state: 'idle' });
      return;
    }
    if (!LOGIN_ID_PATTERN.test(id)) {
      setIdCheck({ state: 'bad', reason: t('acc.idRule') });
      return;
    }
    setIdCheck({ state: 'checking' });
    let alive = true;
    const timer = setTimeout(() => {
      api<{ available: boolean; reason: string | null }>(
        `/accounts/check-login-id?loginId=${encodeURIComponent(id)}`,
      )
        .then((r) => {
          if (!alive) return;
          setIdCheck(r.available ? { state: 'ok' } : { state: 'bad', reason: r.reason ?? '' });
        })
        .catch(() => alive && setIdCheck({ state: 'idle' }));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [loginId, isNew]);

  // 내게 없는 권한이 든 그룹은 주거나 뺄 수 없다(서버 규칙과 같게 미리 흐리게)
  const allowed = useCallback(
    (roleId: string) => {
      if (isWildcard) return true;
      const r = roles.find((x) => x.id === roleId);
      return !!r && !r.isSuperAdmin && r.permissions.every((p) => myPerms.includes(p));
    },
    [roles, isWildcard, myPerms],
  );
  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: r.name, disabled: !allowed(r.id) })),
    [roles, allowed],
  );
  const positionOptions = useMemo(
    () => [
      { value: NONE, label: t('acc.none') },
      ...positions
        .filter((p) => p.isActive !== false || p.id === account?.positionId)
        .map((p) => ({ value: p.id, label: p.name })),
    ],
    [positions, account?.positionId],
  );

  // 새 계정: 직책의 '추천 권한 그룹'을 소속 범위로 미리 넣는다(비어 있거나 자동으로 넣은 그대로일 때만)
  const suggest = (posId: string, orgId: string) => {
    if (!isNew) return;
    const untouched =
      assigns.length === 0 ||
      (assigns.length === 1 && autoAssign && sameAssign(assigns[0], autoAssign));
    if (!untouched) return;
    const pos = positions.find((p) => p.id === posId);
    const next =
      pos?.defaultRoleId && allowed(pos.defaultRoleId)
        ? ({ roleId: pos.defaultRoleId, dataScope: 'ORG', orgScopeId: orgId || null } as Assign)
        : null;
    setAssigns(next ? [next] : []);
    setAutoAssign(next);
  };

  const setRow = (i: number, patch: Partial<Assign>) =>
    setAssigns((prev) => prev.map((a, k) => (k === i ? { ...a, ...patch } : a)));

  const pwShort = password.length > 0 && password.length < 6;
  const pwMismatch = password2.length > 0 && password !== password2;
  const hadEmployee = !!account?.employeeId;
  // 외부 업체 계정은 직원이 아니다 — 직원 정보 칸을 두지 않는다
  const isPartner = !!account?.partnerName;
  // 예전 계정(직원 없음)은 이름을 비워 두면 직원 정보 없이 권한만 저장한다
  const wantsProfile = !isPartner && (isNew || hadEmployee || name.trim().length > 0);

  // 필수 항목(이름·소속, 새 계정은 아이디·비밀번호, 권한 그룹)이 다 채워져야 저장 버튼 활성
  const canSubmit =
    (!wantsProfile || (!!name.trim() && !!orgUnitId)) &&
    (!isNew ||
      (idCheck.state === 'ok' &&
        password.length >= 6 &&
        password === password2 &&
        assigns.length > 0)) &&
    assigns.every((a) => !!a.roleId && (a.dataScope !== 'ORG' || !!a.orgScopeId));

  const save = async () => {
    if (wantsProfile && (!name.trim() || !orgUnitId)) {
      toast({ type: 'warning', title: t('acc.nameOrgReq') });
      return;
    }
    if (isNew) {
      if (idCheck.state !== 'ok') {
        toast({
          type: 'warning',
          title:
            idCheck.state === 'bad'
              ? idCheck.reason
              : idCheck.state === 'checking'
                ? t('acc.idChecking')
                : t('acc.idReq'),
        });
        return;
      }
      if (password.length < 6) {
        toast({ type: 'warning', title: t('acc.pwMin') });
        return;
      }
      if (password !== password2) {
        toast({ type: 'warning', title: t('acc.pwMismatch') });
        return;
      }
    }
    if (assigns.some((a) => !a.roleId)) {
      toast({ type: 'warning', title: t('acc.groupReq') });
      return;
    }
    if (assigns.some((a) => a.dataScope === 'ORG' && !a.orgScopeId)) {
      toast({ type: 'warning', title: t('acc.orgReq') });
      return;
    }
    if (isNew && !assigns.length) {
      toast({ type: 'warning', title: t('acc.groupMin') });
      return;
    }
    const roleBody = assigns.map((a) => ({
      ...a,
      orgScopeId: a.dataScope === 'ORG' ? a.orgScopeId : null,
    }));
    const employee = {
      name: name.trim(),
      orgUnitId,
      positionId: positionId === NONE ? null : positionId,
      phone: phone.trim() || undefined,
      hireDate: hireDate || null,
    };
    setSaving(true);
    try {
      if (isNew) {
        await api('/accounts', {
          method: 'POST',
          body: JSON.stringify({ loginId: loginId.trim(), password, employee, roles: roleBody }),
        });
        toast({ type: 'success', title: t('acc.created', { v0: employee.name }) });
      } else {
        if (wantsProfile) {
          await api(`/accounts/${account.id}/profile`, {
            method: 'PUT',
            body: JSON.stringify(employee),
          });
        }
        await api(`/accounts/${account.id}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ roles: roleBody }),
        });
        toast({ type: 'success', title: t('acc.savedApplied') });
      }
      await onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('acc.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? t('acc.createTitle') : t('acc.editTitle', { v0: account.loginId })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('acc.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!canSubmit || saving}
            onClick={() => void save()}
          >
            {isNew ? t('acc.createSubmit') : t('acc.save')}
          </Button>
        </>
      }
    >
      <div className={styles.section} style={{ gap: 22 }}>
        {isPartner ? (
          <div className={styles.notice} style={{ margin: 0 }}>
            {account?.partnerName} {t('acc.partnerHelp1')}
            {t('acc.partnerHelp2')}
          </div>
        ) : (
          <div className={styles.section}>
            <span className={styles.panelTitle}>{t('acc.employeeInfo')}</span>
            {!isNew && !hadEmployee && <span className={styles.hint}>{t('acc.noEmployee')}</span>}
            <div className={styles.formGrid}>
              <Input
                label={t('acc.nameReq')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('acc.namePh')}
              />
              <Select
                label={t('acc.orgReqLabel')}
                value={orgUnitId || undefined}
                placeholder={t('acc.pickOrg')}
                onValueChange={(v) => {
                  setOrgUnitId(v);
                  suggest(positionId, v);
                }}
                options={orgs}
              />
              <Select
                label={t('acc.position')}
                value={positionId}
                onValueChange={(v) => {
                  setPositionId(v);
                  suggest(v, orgUnitId);
                }}
                options={positionOptions}
              />
              <label className={styles.phoneField}>
                {t('acc.phone')}
                <PhoneInput value={phone} onChange={setPhone} />
              </label>
              <DatePicker
                label={t('acc.hireDate')}
                value={hireDate}
                onChange={(v) => setHireDate(v)}
              />
              <Input
                label={t('acc.empNo')}
                value={account?.empNo ?? ''}
                readOnly
                disabled
                placeholder={t('acc.empNoAuto', { v0: (hireDate || today()).slice(0, 4) })}
                helperText={isNew || !account?.empNo ? t('acc.empNoHelp') : undefined}
              />
            </div>
          </div>
        )}

        {isNew && (
          <div className={styles.section}>
            <span className={styles.panelTitle}>{t('acc.loginInfo')}</span>
            <div className={styles.formGrid}>
              <Input
                label={t('acc.idLabel')}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder={t('acc.idPh')}
                autoComplete="off"
                errorMessage={idCheck.state === 'bad' ? idCheck.reason : undefined}
                helperText={
                  idCheck.state === 'ok'
                    ? t('acc.idOk')
                    : idCheck.state === 'checking'
                      ? t('acc.checking')
                      : undefined
                }
                className={idCheck.state === 'ok' ? styles.okField : undefined}
              />
              <span />
              <PasswordInput
                label={t('acc.pwLabel')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('acc.min6')}
                autoComplete="new-password"
                showToggle
                fullWidth
                error={pwShort ? t('acc.min6Err') : undefined}
              />
              <PasswordInput
                label={t('acc.pw2Label')}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder={t('acc.pw2Ph')}
                autoComplete="new-password"
                showToggle
                fullWidth
                error={pwMismatch ? t('acc.pwMismatch2') : undefined}
                hint={password2.length > 0 && !pwMismatch ? t('acc.pwMatch') : undefined}
              />
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.panelTitle}>{t('acc.groups')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAssigns((p) => [
                  ...p,
                  { roleId: '', dataScope: 'ORG', orgScopeId: orgUnitId || null },
                ])
              }
            >
              <Plus size={14} /> {t('acc.addGroup')}
            </Button>
          </div>
          <span className={styles.hint}>
            {isNew ? t('acc.groupHelp0') : ''}
            {t('acc.groupHelp1')}
            {t('acc.groupHelp2')}
          </span>
          {assigns.length === 0 ? (
            <div className={styles.notice} style={{ margin: 0 }}>
              {t('acc.noGroups')}
            </div>
          ) : (
            <div className={styles.assignList}>
              {assigns.map((a, i) => {
                const locked = !!a.roleId && !allowed(a.roleId);
                return (
                  <div key={i} className={styles.assignRow}>
                    <Select
                      label={i === 0 ? t('acc.groupLabel') : undefined}
                      value={a.roleId || undefined}
                      placeholder={t('acc.pickGroup')}
                      onValueChange={(v) => setRow(i, { roleId: v })}
                      options={roleOptions}
                      disabled={locked}
                    />
                    <Select
                      label={i === 0 ? t('acc.col.scope') : undefined}
                      value={a.dataScope}
                      onValueChange={(v) => setRow(i, { dataScope: v as Assign['dataScope'] })}
                      options={SCOPE_OPTIONS}
                      disabled={locked}
                    />
                    <Select
                      label={i === 0 ? t('acc.targetOrg') : undefined}
                      value={a.dataScope === 'ORG' ? (a.orgScopeId ?? undefined) : undefined}
                      placeholder={a.dataScope === 'ORG' ? t('acc.pickOrg2') : t('acc.na')}
                      onValueChange={(v) => setRow(i, { orgScopeId: v })}
                      options={orgs}
                      disabled={locked || a.dataScope !== 'ORG'}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('acc.removeGroup')}
                      disabled={locked}
                      title={locked ? t('acc.lockedGroup') : t('acc.remove')}
                      onClick={() => setAssigns((p) => p.filter((_, k) => k !== i))}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameAssign(a: Assign, b: Assign) {
  return a.roleId === b.roleId && a.dataScope === b.dataScope && a.orgScopeId === b.orgScopeId;
}
