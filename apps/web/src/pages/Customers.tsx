import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Settings } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Checkbox, Input, Modal, useToast } from '../components/ui';
import CrudTable, { type Column, type FormField, type Row } from '../components/CrudTable';
import { useOptions } from '../lib/useOptions';

interface GradeRow {
  id?: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

const GRADE_GROUP = 'CUSTOMER_GRADE';

/** 새 등급 코드 — 화면에는 이름만 보이고 코드는 시스템이 붙인다 */
const newCode = () => `G${Date.now().toString(36).toUpperCase()}`;

/**
 * 고객 등급 설정(관리자) — 이름 바꾸기·순서·사용 여부·새 등급 추가.
 * 등급은 지우지 않는다(이미 그 등급인 고객이 있을 수 있어서) — 더 쓰지 않으면 '사용' 체크를 끈다.
 */
function GradeSettings({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [orig, setOrig] = useState<GradeRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<GradeRow[]>(`/common-codes?group=${GRADE_GROUP}`)
      .then((r) => {
        const sorted = [...r].sort((a, b) => a.sortOrder - b.sortOrder);
        setRows(sorted);
        setOrig(sorted);
      })
      .catch(() => setRows([]));
  }, [open]);

  const patch = (i: number, p: Partial<GradeRow>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const n = [...rs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  // 등급 이름이 모두 채워져야 저장 버튼 활성
  const canSubmit = rows.every((r) => !!r.name.trim());

  const save = async () => {
    if (rows.some((r) => !r.name.trim())) {
      toast({ type: 'warning', title: '등급 이름을 입력하세요' });
      return;
    }
    const names = rows.map((r) => r.name.trim());
    if (new Set(names).size !== names.length) {
      toast({ type: 'warning', title: '같은 이름의 등급이 있습니다' });
      return;
    }
    setSaving(true);
    try {
      for (const [i, r] of rows.entries()) {
        const body = { name: r.name.trim(), sortOrder: (i + 1) * 10, isActive: r.isActive };
        if (!r.id) {
          await api('/common-codes', {
            method: 'POST',
            body: JSON.stringify({ codeGroup: GRADE_GROUP, code: r.code, ...body }),
          });
          continue;
        }
        const before = orig.find((o) => o.id === r.id);
        if (
          before &&
          before.name === body.name &&
          before.isActive === body.isActive &&
          before.sortOrder === body.sortOrder
        )
          continue;
        await api(`/common-codes/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      toast({ type: 'success', title: '고객 등급을 저장했습니다' });
      onSaved();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="고객 등급 설정"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={saving}
            disabled={!canSubmit || saving}
          >
            저장
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--ark-color-text-secondary)' }}>
          위에서부터 순서대로 보입니다. 더 쓰지 않는 등급은 &apos;사용&apos;을 끄세요(이미 그 등급인
          고객은 그대로 둡니다).
        </div>
        {rows.map((r, i) => (
          <div key={r.id ?? r.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Button variant="ghost" size="sm" aria-label="위로" onClick={() => move(i, -1)}>
              <ArrowUp size={14} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="아래로" onClick={() => move(i, 1)}>
              <ArrowDown size={14} />
            </Button>
            <div style={{ flex: 1 }}>
              <Input
                value={r.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                aria-label="등급 이름"
                maxLength={30}
              />
            </div>
            <Checkbox
              checked={r.isActive}
              onCheckedChange={(v) => patch(i, { isActive: v === true })}
              label="사용"
            />
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { code: newCode(), name: '', sortOrder: (rs.length + 1) * 10, isActive: true },
              ])
            }
          >
            등급 추가
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 고객관리 — 등급은 정해진 목록(관리자가 설정 아이콘에서 정의)에서 고른다 */
export default function Customers() {
  const { can } = useAuth();
  const orgs = useOptions('/org-units', 'name');
  const [gradeVer, setGradeVer] = useState(0);
  const grades = useOptions(`/customers/grades?v=${gradeVer}`, 'name', 'code');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gradeName = useMemo(() => new Map(grades.map((g) => [g.value, g.label])), [grades]);

  const columns: Column[] = [
    { title: '고객명', dataIndex: 'name' },
    { title: '연락처', dataIndex: 'phonePrimary' },
    {
      title: '등급',
      render: (r: Row) =>
        r.grade ? (
          <Badge variant="subtle" color={r.grade === 'VIP' ? 'primary' : 'neutral'}>
            {gradeName.get(String(r.grade)) ?? String(r.grade)}
          </Badge>
        ) : (
          '-'
        ),
    },
    { title: '주소', render: (r) => (r.addr ? `(${r.zipcode ?? ''}) ${r.addr}` : '-') },
  ];
  const fields: FormField[] = [
    { name: 'name', label: '고객명', required: true },
    { name: 'phonePrimary', label: '연락처', type: 'tel' },
    { name: 'grade', label: '등급', type: 'select', options: grades },
    { name: 'ownerOrgId', label: '담당 조직', type: 'select', options: orgs },
    { name: 'address', label: '주소', type: 'address', addrPrefix: '' },
  ];

  return (
    <>
      <CrudTable
        title="고객"
        path="/customers"
        columns={columns}
        fields={fields}
        editable
        headerActions={
          can('COMMON_CODE.UPDATE') ? (
            <button
              type="button"
              aria-label="고객 등급 설정"
              title="고객 등급 설정"
              onClick={() => setSettingsOpen(true)}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 28,
                height: 28,
                border: '1px solid var(--ark-color-border)',
                borderRadius: 8,
                background: 'transparent',
                color: 'var(--ark-color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <Settings size={14} />
            </button>
          ) : undefined
        }
      />
      <GradeSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setGradeVer((v) => v + 1)}
      />
    </>
  );
}
