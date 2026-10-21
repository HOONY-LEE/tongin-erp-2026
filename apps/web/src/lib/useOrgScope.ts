import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAuth } from '../auth/AuthContext';

interface OrgUnitRow {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * 조직 선택지 + "내가 고를 수 있는지" 판정.
 *
 * 서버(ScopeService.orgScopeIds)와 같은 규칙을 화면에서도 계산한다 —
 * '*' 권한이거나 ALL 스코프면 무제한, 아니면 ORG 스코프 조직 + 그 하위 전부.
 * 목록 자체는 전체를 그대로 보여주고(권한 밖 지점이 있다는 사실은 감추지 않는다),
 * 고를 수 없는 항목만 disabled로 흐리게 만든다.
 */
export function useOrgScope() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrgUnitRow[]>([]);

  useEffect(() => {
    api<OrgUnitRow[]>('/org-units')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const unrestricted =
    !!user && (user.permissions.includes('*') || user.scopes.some((s) => s.dataScope === 'ALL'));

  /** 고를 수 있는 조직 id. null = 무제한. */
  const allowedIds = useMemo<Set<string> | null>(() => {
    if (unrestricted) return null;
    const roots = (user?.scopes ?? [])
      .filter((s) => s.dataScope === 'ORG' && s.orgScopeId)
      .map((s) => s.orgScopeId as string);
    const allowed = new Set(roots);
    // 하위 조직까지 넓힌다(BFS) — 서버 withDescendants와 같은 동작.
    let frontier = roots;
    while (frontier.length) {
      const next = rows
        .filter((r) => r.parentId && frontier.includes(r.parentId) && !allowed.has(r.id))
        .map((r) => r.id);
      next.forEach((id) => allowed.add(id));
      frontier = next;
    }
    return allowed;
  }, [unrestricted, user, rows]);

  const options = useMemo(
    () =>
      rows.map((r) => ({
        value: r.id,
        label: r.name,
        disabled: allowedIds ? !allowedIds.has(r.id) : false,
      })),
    [rows, allowedIds],
  );

  /** 기본 선택할 소속 조직 — 스코프가 여러 개면 첫 번째. */
  const ownOrgId = user?.scopes.find((s) => s.orgScopeId)?.orgScopeId ?? '';

  return { options, ownOrgId, unrestricted };
}
