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
interface Emp {
  id: string;
  name: string;
  orgUnitId: string;
  positionId: string | null;
  position: { name: string } | null;
}
interface PositionOpt {
  id: string;
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
  const [emps, setEmps] = useState<Emp[]>([]);
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
    api<Emp[]>('/employees')
      .then(setEmps)
      .catch(() => setEmps([]));
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
          <span className={styles.muted}>직원 연결 없음</span>
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
              권한 편집
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
          emps={emps}
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

function AccountModal({
  account,
  roles,
  emps,
  positions,
  orgs,
  isWildcard,
  myPerms,
  onClose,
  onSaved,
}: {
  account: Account | null;
  roles: RoleOpt[];
  emps: Emp[];
  positions: PositionOpt[];
  orgs: { value: string; label: string }[];
  isWildcard: boolean;
  myPerms: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const isNew = !account;
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState<string>(account?.employeeId ?? NONE);
  const [assigns, setAssigns] = useState<Assign[]>(
    account
      ? account.roles.map((r) => ({
          roleId: r.roleId,
          dataScope: r.dataScope as Assign['dataScope'],
          orgScopeId: r.orgScopeId,
        }))
      : [],
  );
  const [saving, setSaving] = useState(false);

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
  const empOptions = useMemo(
    () => [
      { value: NONE, label: '연결 안 함' },
      ...emps.map((e) => ({
        value: e.id,
        label: e.position ? `${e.name} · ${e.position.name}` : e.name,
      })),
    ],
    [emps],
  );

  // 직원을 고르면 그 직원 직책의 '추천 권한 그룹'을 소속 지점 범위로 미리 넣는다(새 계정, 비어 있을 때만)
  const pickEmployee = (id: string) => {
    setEmployeeId(id);
    if (!isNew || assigns.length) return;
    const emp = emps.find((e) => e.id === id);
    const pos = positions.find((p) => p.id === emp?.positionId);
    if (emp && pos?.defaultRoleId && allowed(pos.defaultRoleId)) {
      setAssigns([{ roleId: pos.defaultRoleId, dataScope: 'ORG', orgScopeId: emp.orgUnitId }]);
    }
  };

  const setRow = (i: number, patch: Partial<Assign>) =>
    setAssigns((prev) => prev.map((a, k) => (k === i ? { ...a, ...patch } : a)));

  const save = async () => {
    if (isNew && (!loginId.trim() || password.length < 6)) {
      toast({ type: 'warning', title: '아이디와 비밀번호(6자 이상)를 입력해 주세요' });
      return;
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
    const roles = assigns.map((a) => ({
      ...a,
      orgScopeId: a.dataScope === 'ORG' ? a.orgScopeId : null,
    }));
    const emp = employeeId === NONE ? null : employeeId;
    setSaving(true);
    try {
      if (isNew) {
        await api('/accounts', {
          method: 'POST',
          body: JSON.stringify({
            loginId: loginId.trim(),
            password,
            employeeId: emp ?? undefined,
            roles,
          }),
        });
        toast({ type: 'success', title: '계정을 만들었습니다' });
      } else {
        if (emp !== account.employeeId) {
          await api(`/accounts/${account.id}/employee`, {
            method: 'PUT',
            body: JSON.stringify({ employeeId: emp }),
          });
        }
        await api(`/accounts/${account.id}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ roles }),
        });
        toast({ type: 'success', title: '권한을 저장했습니다 — 다음 요청부터 바로 적용됩니다' });
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
      title={isNew ? '계정 생성' : `권한 편집 — ${account.loginId}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div className={styles.section} style={{ gap: 18 }}>
        <div className={styles.formGrid}>
          {isNew && (
            <>
              <Input
                label="아이디"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="user1"
              />
              <Input
                label="비밀번호(6자 이상)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          <Select
            label="연결할 직원(직책·소속은 직원 정보를 따릅니다)"
            value={employeeId}
            onValueChange={pickEmployee}
            options={empOptions}
          />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.panelTitle}>권한 그룹</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAssigns((p) => [...p, { roleId: '', dataScope: 'ORG', orgScopeId: null }])
              }
            >
              <Plus size={14} /> 그룹 추가
            </Button>
          </div>
          <span className={styles.hint}>
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
