import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { useOptions } from '../../lib/useOptions';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  PasswordInput,
  Select,
  useToast,
  type Column,
  type Row,
} from '../../components/ui';
import styles from './access.module.css';

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
  employeeName: string | null;
  orgUnitId: string | null;
  positionId: string | null;
  phone: string | null;
  empNo: string | null;
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

const SCOPE_LABEL: Record<string, string> = { OWN: '본인 담당', ORG: '소속 조직', ALL: '전체' };
const SCOPE_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'ORG', label: '소속 조직(+하위)' },
  { value: 'OWN', label: '본인 담당만' },
];
const NONE = '__none__';
const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

/**
 * 계정 — 누가 어떤 권한 그룹을, 어느 데이터 범위로 갖는지.
 * 한 계정에 그룹을 여러 개 줄 수 있고(권한은 합쳐진다), 그룹마다 범위를 따로 정한다.
 * 예) 강남점장: '지점장' 그룹 · 소속 조직(강남점)
 */
export default function AccountList() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Account[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [positions, setPositions] = useState<PositionOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const orgs = useOptions('/org-units', 'name');
  const isWildcard = user?.permissions.includes('*') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Account[]>('/accounts'));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      toast({ type: 'success', title: r.isActive ? '비활성화했습니다' : '활성화했습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    }
  };

  const columns: Column[] = [
    { title: '아이디', dataIndex: 'loginId', width: 140 },
    {
      title: '직원 · 직책',
      minWidth: 160,
      render: (r) =>
        r.employeeName ? (
          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
            <span>
              {String(r.employeeName)}
              {r.positionName ? (
                <span className={styles.muted}> · {String(r.positionName)}</span>
              ) : null}
            </span>
            {r.orgUnitName ? <span className={styles.muted}>{String(r.orgUnitName)}</span> : null}
          </span>
        ) : (
          <span className={styles.muted}>직원 정보 없음</span>
        ),
    },
    {
      title: '권한 그룹 · 데이터 범위',
      flex: 1,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(r.roles as AccountRole[]).length === 0 ? (
            <span className={styles.muted}>권한 없음</span>
          ) : (
            (r.roles as AccountRole[]).map((role, i) => (
              <Badge key={i} variant="subtle" color="info">
                {role.roleName} · {SCOPE_LABEL[role.dataScope] ?? role.dataScope}
                {role.orgScope ? `(${role.orgScope})` : ''}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      title: '상태',
      width: 80,
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '활성' : '비활성'}
        </Badge>
      ),
    },
    {
      title: '관리',
      width: 190,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {can('USER.UPDATE') && (
            <Button variant="outline" size="sm" onClick={() => setEditing(r as unknown as Account)}>
              편집
            </Button>
          )}
          {
            // 본인 계정은 끌 수 없다(서버에서도 막는다)
            r.id === user?.userId ? (
              <span className={styles.muted} style={{ alignSelf: 'center' }}>
                본인
              </span>
            ) : can('USER.UPDATE') ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void toggleActive(r as unknown as Account)}
              >
                {r.isActive ? '비활성화' : '활성화'}
              </Button>
            ) : null
          }
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        toolbarActions={
          can('USER.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              + 계정 생성
            </Button>
          ) : undefined
        }
      />
      {editing && (
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
      )}
    </>
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
  const toast = useToast();
  const isNew = !account;
  const [name, setName] = useState(account?.employeeName ?? '');
  const [orgUnitId, setOrgUnitId] = useState(account?.orgUnitId ?? '');
  const [positionId, setPositionId] = useState(account?.positionId ?? NONE);
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [empNo, setEmpNo] = useState(account?.empNo ?? '');
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
      setIdCheck({ state: 'bad', reason: '영문·숫자·. _ - 로 3~50자로 입력해 주세요' });
      return;
    }
    setIdCheck({ state: 'checking' });
    let alive = true;
    const t = setTimeout(() => {
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
      clearTimeout(t);
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
      { value: NONE, label: '없음' },
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
  // 예전 계정(직원 없음)은 이름을 비워 두면 직원 정보 없이 권한만 저장한다
  const wantsProfile = isNew || hadEmployee || name.trim().length > 0;

  const save = async () => {
    if (wantsProfile && (!name.trim() || !orgUnitId)) {
      toast({ type: 'warning', title: '직원 이름과 소속을 입력해 주세요' });
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
                ? '아이디를 확인하는 중입니다'
                : '아이디를 입력해 주세요',
        });
        return;
      }
      if (password.length < 6) {
        toast({ type: 'warning', title: '비밀번호를 6자 이상 입력해 주세요' });
        return;
      }
      if (password !== password2) {
        toast({ type: 'warning', title: '비밀번호 확인이 일치하지 않습니다' });
        return;
      }
    }
    if (assigns.some((a) => !a.roleId)) {
      toast({ type: 'warning', title: '권한 그룹을 골라 주세요' });
      return;
    }
    if (assigns.some((a) => a.dataScope === 'ORG' && !a.orgScopeId)) {
      toast({ type: 'warning', title: '범위가 "소속 조직"이면 대상 조직을 골라 주세요' });
      return;
    }
    if (isNew && !assigns.length) {
      toast({ type: 'warning', title: '권한 그룹을 하나 이상 넣어 주세요' });
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
      empNo: empNo.trim() || undefined,
    };
    setSaving(true);
    try {
      if (isNew) {
        await api('/accounts', {
          method: 'POST',
          body: JSON.stringify({ loginId: loginId.trim(), password, employee, roles: roleBody }),
        });
        toast({ type: 'success', title: `${employee.name} 님 계정을 만들었습니다` });
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
        toast({ type: 'success', title: '저장했습니다 — 권한은 다음 요청부터 바로 적용됩니다' });
      }
      await onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? '계정 생성(직원 등록)' : `계정 편집 — ${account.loginId}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {isNew ? '계정 만들기' : '저장'}
          </Button>
        </>
      }
    >
      <div className={styles.section} style={{ gap: 22 }}>
        <div className={styles.section}>
          <span className={styles.panelTitle}>직원 정보</span>
          {!isNew && !hadEmployee && (
            <span className={styles.hint}>
              직원 정보가 없는 계정입니다. 이름과 소속을 넣고 저장하면 직원으로도 등록됩니다.
            </span>
          )}
          <div className={styles.formGrid}>
            <Input
              label="이름 *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
            />
            <Select
              label="소속 *"
              value={orgUnitId || undefined}
              placeholder="소속 고르기"
              onValueChange={(v) => {
                setOrgUnitId(v);
                suggest(positionId, v);
              }}
              options={orgs}
            />
            <Select
              label="직책"
              value={positionId}
              onValueChange={(v) => {
                setPositionId(v);
                suggest(v, orgUnitId);
              }}
              options={positionOptions}
            />
            <Input
              label="연락처"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
            />
            <Input
              label="사번"
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
              placeholder="선택"
            />
          </div>
        </div>

        {isNew && (
          <div className={styles.section}>
            <span className={styles.panelTitle}>로그인 정보</span>
            <div className={styles.formGrid}>
              <Input
                label="아이디 *"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="영문·숫자 3자 이상"
                autoComplete="off"
                errorMessage={idCheck.state === 'bad' ? idCheck.reason : undefined}
                helperText={
                  idCheck.state === 'ok'
                    ? '✓ 사용할 수 있는 아이디입니다'
                    : idCheck.state === 'checking'
                      ? '확인하는 중…'
                      : undefined
                }
                className={idCheck.state === 'ok' ? styles.okField : undefined}
              />
              <span />
              <PasswordInput
                label="비밀번호 *"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                autoComplete="new-password"
                showToggle
                fullWidth
                error={pwShort ? '6자 이상 입력해 주세요' : undefined}
              />
              <PasswordInput
                label="비밀번호 확인 *"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="한 번 더 입력"
                autoComplete="new-password"
                showToggle
                fullWidth
                error={pwMismatch ? '비밀번호가 일치하지 않습니다' : undefined}
                hint={password2.length > 0 && !pwMismatch ? '✓ 비밀번호가 일치합니다' : undefined}
              />
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.panelTitle}>권한 그룹</span>
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
              <Plus size={14} /> 그룹 추가
            </Button>
          </div>
          <span className={styles.hint}>
            {isNew ? '직책을 고르면 그 직책의 추천 권한 그룹이 소속 범위로 들어갑니다. ' : ''}
            그룹을 여러 개 주면 권한이 합쳐집니다. 데이터 범위는 그 그룹으로 볼 수 있는 데이터의
            범위입니다 — 전체 / 소속 조직(+하위 지점) / 본인 담당 건만.
          </span>
          {assigns.length === 0 ? (
            <div className={styles.notice} style={{ margin: 0 }}>
              권한 그룹이 없습니다. 이 계정은 로그인해도 아무 메뉴도 보이지 않습니다.
            </div>
          ) : (
            <div className={styles.assignList}>
              {assigns.map((a, i) => {
                const locked = !!a.roleId && !allowed(a.roleId);
                return (
                  <div key={i} className={styles.assignRow}>
                    <Select
                      label={i === 0 ? '권한 그룹' : undefined}
                      value={a.roleId || undefined}
                      placeholder="그룹 고르기"
                      onValueChange={(v) => setRow(i, { roleId: v })}
                      options={roleOptions}
                      disabled={locked}
                    />
                    <Select
                      label={i === 0 ? '데이터 범위' : undefined}
                      value={a.dataScope}
                      onValueChange={(v) => setRow(i, { dataScope: v as Assign['dataScope'] })}
                      options={SCOPE_OPTIONS}
                      disabled={locked}
                    />
                    <Select
                      label={i === 0 ? '대상 조직' : undefined}
                      value={a.dataScope === 'ORG' ? (a.orgScopeId ?? undefined) : undefined}
                      placeholder={a.dataScope === 'ORG' ? '조직 고르기' : '해당 없음'}
                      onValueChange={(v) => setRow(i, { orgScopeId: v })}
                      options={orgs}
                      disabled={locked || a.dataScope !== 'ORG'}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="이 그룹 빼기"
                      disabled={locked}
                      title={locked ? '내게 없는 권한이 든 그룹이라 뺄 수 없습니다' : '빼기'}
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

function sameAssign(a: Assign, b: Assign) {
  return a.roleId === b.roleId && a.dataScope === b.dataScope && a.orgScopeId === b.orgScopeId;
}
