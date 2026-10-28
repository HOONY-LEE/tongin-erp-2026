import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { ORG_UNIT_TYPE_LABEL } from '@tongin/shared';
import { isHqUnit, type OrgUnitRow } from '../lib/orgUnits';
import styles from './OrgChart.module.css';

export interface OrgChartEmployee {
  id: string;
  orgUnitId: string;
  name: string;
  isActive?: boolean;
  position?: { name: string; sortOrder?: number | null } | null;
}

interface Props {
  /** 조직 전체(본사+지점). 본사 조직만 상자로 그리고, 지점은 상위 조직 상자에 'N곳'으로 접어 둔다 */
  units: OrgUnitRow[];
  /** 주면 조직마다 소속 직원(재직)을 상자 안에 나열한다 — 직원 탭의 조직도 */
  employees?: OrgChartEmployee[];
  /** 조직 상자 클릭(조직 탭: 조직 상세) */
  onUnitClick?: (id: string) => void;
  /** 직원 이름 클릭(직원 탭: 직원 상세) */
  onEmployeeClick?: (id: string) => void;
  /** 'N곳' 지점 묶음 클릭 — 지점관리로 */
  onBranchesClick?: () => void;
}

interface Node {
  unit: OrgUnitRow;
  children: Node[];
  branchCount: number;
  members: OrgChartEmployee[];
  /** 직원 목록이 없을 때 상자에 보일 인원(직원 데이터가 있으면 그 수) */
  headcount: number | null;
}

/** 자식이 3개 이상이고 모두 하위 조직이 없으면 묶음으로 그린다 */
const isLeafGroup = (n: Node) =>
  n.children.length >= 3 && n.children.every((c) => c.children.length === 0);

const byPosition = (a: OrgChartEmployee, b: OrgChartEmployee) =>
  (a.position?.sortOrder ?? 999) - (b.position?.sortOrder ?? 999) || a.name.localeCompare(b.name);

/**
 * 본사 조직도 — 그룹 → 법인 → 부서를 위에서 아래로 잇는다.
 * 넓어지면(부서가 많으면) 가로로 스크롤된다. 순서는 서버 목록 순서(조직 코드순)를 따른다.
 */
export function OrgChart({
  units,
  employees,
  onUnitClick,
  onEmployeeClick,
  onBranchesClick,
}: Props) {
  const roots = useMemo(() => {
    const hq = units.filter(isHqUnit);
    const hqIds = new Set(hq.map((u) => u.id));
    const active = (employees ?? []).filter((e) => e.isActive !== false);
    const membersOf = new Map<string, OrgChartEmployee[]>();
    for (const e of active) {
      const list = membersOf.get(e.orgUnitId) ?? [];
      list.push(e);
      membersOf.set(e.orgUnitId, list);
    }
    const build = (u: OrgUnitRow): Node => {
      const members = (membersOf.get(u.id) ?? []).sort(byPosition);
      return {
        unit: u,
        children: hq.filter((c) => c.parentId === u.id).map(build),
        branchCount: units.filter((c) => c.type === 'BRANCH' && c.parentId === u.id).length,
        members,
        headcount: employees ? members.length : null,
      };
    };
    // 상위가 없거나 상위가 본사 조직이 아니면(지점 밑 부서 같은 예외) 맨 위에 둔다
    return hq.filter((u) => !u.parentId || !hqIds.has(u.parentId)).map(build);
  }, [units, employees]);

  const showMembers = !!employees;

  const renderCard = (n: Node) => (
    <div
      className={`${styles.card} ${n.unit.isActive ? '' : styles.inactive}`}
      data-type={n.unit.type}
    >
      {onUnitClick ? (
        <button type="button" className={styles.head} onClick={() => onUnitClick(n.unit.id)}>
          <CardHead n={n} />
        </button>
      ) : (
        <div className={styles.head}>
          <CardHead n={n} />
        </div>
      )}
      {/* ul/li를 쓰면 조직도 연결선 규칙(.tree ul / .tree li)이 직원 목록에도 걸린다 — div + role로 */}
      {showMembers && n.members.length > 0 && (
        <div className={styles.members} role="list">
          {n.members.map((e) => (
            <div key={e.id} role="listitem">
              <button
                type="button"
                className={styles.member}
                onClick={() => onEmployeeClick?.(e.id)}
                disabled={!onEmployeeClick}
              >
                <span className={styles.memberName}>{e.name}</span>
                {e.position?.name && <span className={styles.memberPos}>{e.position.name}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
      {n.branchCount > 0 && (
        <button
          type="button"
          className={styles.branches}
          onClick={onBranchesClick}
          disabled={!onBranchesClick}
          title="지점은 지점관리에서 관리합니다"
        >
          지점 {n.branchCount}곳{onBranchesClick && <ChevronRight size={14} aria-hidden />}
        </button>
      )}
    </div>
  );

  const renderNode = (n: Node): JSX.Element => (
    <li key={n.unit.id}>
      {renderCard(n)}
      {n.children.length > 0 &&
        (isLeafGroup(n) ? (
          // 하위 조직이 없는 부서가 여럿이면 한 줄로 늘어놓지 않고 묶음(3열)으로 접는다 —
          // 부서가 9개만 돼도 가로로 2000px를 넘어 한 화면에 안 들어온다
          <div className={styles.groupWrap}>
            <div className={styles.group}>
              {n.children.map((c) => (
                <div key={c.unit.id}>{renderCard(c)}</div>
              ))}
            </div>
          </div>
        ) : (
          <ul>{n.children.map(renderNode)}</ul>
        ))}
    </li>
  );

  if (roots.length === 0) {
    return <div className={styles.empty}>표시할 조직이 없습니다</div>;
  }

  return (
    <div className={styles.scroll}>
      <div className={styles.tree}>
        <ul>{roots.map(renderNode)}</ul>
      </div>
    </div>
  );
}

function CardHead({ n }: { n: Node }) {
  const typeLabel = (ORG_UNIT_TYPE_LABEL as Record<string, string>)[n.unit.type] ?? n.unit.type;
  return (
    <>
      <span className={styles.type}>
        {typeLabel}
        {!n.unit.isActive && ' · 사용 안 함'}
      </span>
      <span className={styles.name}>{n.unit.name}</span>
      {n.headcount !== null && <span className={styles.count}>{n.headcount}명</span>}
    </>
  );
}
