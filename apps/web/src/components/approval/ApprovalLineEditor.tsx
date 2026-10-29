import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import type { ApprovalLineKey, ApprovalStepKind } from '@tongin/shared';
import { api } from '../../lib/api';
import { personLabel, useDirectory, type LineEntry, type Person } from '../../lib/approvals';
import { Badge, Button } from '../ui';
import styles from './approval.module.css';

/**
 * 결재선 편집 — 기본 결재선을 불러와 보여 주고, 신청자가 결재자를 바꾸거나 더하고 뺄 수 있다.
 * 결재(순서대로) + 참조(순서 무관)로 나눠 보여 준다.
 */
export function ApprovalLineEditor({
  docType,
  value,
  onChange,
  myEmployeeId,
}: {
  /** 문서 종류 또는 결재 양식('FORM:<id>') — 그 기본 결재선을 불러온다 */
  docType: ApprovalLineKey;
  /** null이면 기본 결재선을 불러와 채운다 */
  value: LineEntry[] | null;
  onChange: (line: LineEntry[]) => void;
  /** 본인은 결재자로 고를 수 없다 */
  myEmployeeId?: string | null;
}) {
  const { people } = useDirectory();
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (value !== null) return;
    let alive = true;
    setLoading(true);
    api<{ templateName: string | null; entries: LineEntry[] }>(
      `/approvals/line-preview?docType=${encodeURIComponent(docType)}`,
    )
      .then((r) => {
        if (!alive) return;
        setTemplateName(r.templateName);
        onChange(r.entries);
      })
      .catch(() => alive && onChange([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // value가 비었을 때 한 번만 — onChange는 부모가 매번 새로 만들어 의존성에서 뺀다
  }, [docType, value === null]);

  const line = value ?? [];
  const approvers = line.filter((l) => l.kind === 'APPROVER');
  const ccs = line.filter((l) => l.kind === 'CC');

  const options = useMemo(
    () =>
      people
        .filter((p) => p.id !== myEmployeeId)
        .map((p) => ({
          value: p.id,
          label: p.name,
          description: [p.positionName, p.orgUnitName].filter(Boolean).join(' · '),
        })),
    [people, myEmployeeId],
  );

  const set = (approversNext: LineEntry[], ccsNext: LineEntry[]) =>
    onChange([...approversNext, ...ccsNext]);

  const move = (i: number, d: -1 | 1) => {
    const next = [...approvers];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set(next, ccs);
  };

  const add = (kind: ApprovalStepKind) => {
    const p = people.find((x) => x.id === pick);
    if (!p) return;
    const person: Person = {
      id: p.id,
      name: p.name,
      positionName: p.positionName,
      orgUnitName: p.orgUnitName,
    };
    // 같은 사람을 같은 줄에 두 번 넣지 않는다
    if (kind === 'APPROVER' && approvers.some((a) => a.person.id === p.id)) return;
    if (kind === 'CC' && ccs.some((a) => a.person.id === p.id)) return;
    if (kind === 'APPROVER') set([...approvers, { kind, person }], ccs);
    else set(approvers, [...ccs, { kind, person }]);
    setPick(null);
  };

  return (
    <div className={styles.lineEditor}>
      <div className={styles.lineHead}>
        <span>결재선</span>
        <span className={styles.muted}>
          {loading
            ? '불러오는 중…'
            : templateName
              ? `기본: ${templateName} — 바꿔서 올릴 수 있습니다`
              : '기본 결재선(부서장) — 바꿔서 올릴 수 있습니다'}
        </span>
      </div>

      <ol className={styles.lineList}>
        {approvers.map((a, i) => (
          <li key={`a-${a.person.id}`} className={styles.lineRow}>
            <Badge variant="subtle" color="info">
              결재 {i + 1}
            </Badge>
            <span className={styles.lineName}>{personLabel(a.person)}</span>
            <span className={styles.lineActions}>
              <button
                type="button"
                aria-label="앞으로"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label="뒤로"
                disabled={i === approvers.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                aria-label={`${a.person.name} 빼기`}
                onClick={() =>
                  set(
                    approvers.filter((_, k) => k !== i),
                    ccs,
                  )
                }
              >
                <X size={14} />
              </button>
            </span>
          </li>
        ))}
        {ccs.map((c, i) => (
          <li key={`c-${c.person.id}`} className={styles.lineRow}>
            <Badge variant="subtle" color="neutral">
              참조
            </Badge>
            <span className={styles.lineName}>{personLabel(c.person)}</span>
            <span className={styles.lineActions}>
              <button
                type="button"
                aria-label={`${c.person.name} 빼기`}
                onClick={() =>
                  set(
                    approvers,
                    ccs.filter((_, k) => k !== i),
                  )
                }
              >
                <X size={14} />
              </button>
            </span>
          </li>
        ))}
        {!loading && line.length === 0 && (
          <li className={styles.muted}>
            결재자가 없습니다 — 그대로 올리면 바로 승인됩니다. 아래에서 결재자를 더하세요.
          </li>
        )}
      </ol>

      <div className={styles.lineAdd}>
        <div className={styles.lineAddPicker}>
          <Combobox
            options={options}
            value={pick}
            onChange={setPick}
            placeholder="직원 찾기(이름)"
            searchPlaceholder="이름으로 찾기"
            size="sm"
          />
        </div>
        <Button size="sm" variant="outline" disabled={!pick} onClick={() => add('APPROVER')}>
          결재자로 추가
        </Button>
        <Button size="sm" variant="ghost" disabled={!pick} onClick={() => add('CC')}>
          참조로 추가
        </Button>
      </div>
    </div>
  );
}
