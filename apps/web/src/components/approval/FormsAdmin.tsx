import { useEffect, useState } from 'react';
import {
  SUBSTITUTE_MODES,
  SUBSTITUTE_MODE_LABEL,
  type FormField,
  type SubstituteMode,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { useApprovalForms, type ApprovalFormDef } from '../../lib/approvals';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Input,
  PageHeader,
  SegmentedControl,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../ui';
import { FormBuilder, cleanFieldsForSave } from './FormFields';
import styles from './approval.module.css';

/**
 * 결재 양식 관리(APPROVAL.MANAGE) — 지출 결의·구매 품의처럼 회사마다 다른 신청서를 항목으로 정의한다.
 * 양식마다 기본 결재선은 '결재선 설정'에서 문서 종류 '양식 · 이름'으로 정한다(없으면 일반 품의 결재선).
 */
export function FormsAdmin() {
  const { forms, loading, reload } = useApprovalForms(true);
  const [editing, setEditing] = useState<ApprovalFormDef | 'new' | null>(null);
  const custom = forms.filter((f) => f.kind === 'CUSTOM');

  if (editing) {
    return (
      <FormEditor
        initial={editing === 'new' ? null : editing}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
    );
  }

  const columns: Column[] = [
    { title: '양식', dataIndex: 'name', minWidth: 180 },
    { title: '묶음', dataIndex: 'category', width: 110 },
    { title: '설명', dataIndex: 'description', flex: 1, minWidth: 200 },
    {
      title: '항목',
      width: 80,
      numeric: true,
      render: (r) => `${(r.fields as unknown[]).length}개`,
    },
    {
      title: '상태',
      width: 100,
      render: (r) => (
        <Badge variant="subtle" color={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? '사용' : '사용 안 함'}
        </Badge>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={custom as unknown as Row[]}
      loading={loading}
      onRowClick={(r) => setEditing(r as unknown as ApprovalFormDef)}
      toolbarActions={
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          + 새 양식
        </Button>
      }
    />
  );
}

/**
 * 양식 편집 — 이름·묶음·설명·사용 + 항목(만들기·미리보기).
 * 휴가 신청서(kind=LEAVE)는 이름 대신 업무 대리인·사유 필수 설정과 '추가 항목'만 고친다.
 */
export function FormEditor({
  initial,
  onBack,
  onSaved,
  backLabel = '결재 양식',
}: {
  initial: ApprovalFormDef | null;
  onBack?: () => void;
  onSaved: () => void;
  backLabel?: string;
}) {
  const toast = useToast();
  const leave = initial?.kind === 'LEAVE';
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isActive, setActive] = useState(initial?.isActive ?? true);
  const [fields, setFields] = useState<FormField[]>(initial?.fields ?? []);
  const [substitute, setSubstitute] = useState<SubstituteMode>(
    initial?.settings.substitute ?? 'OPTIONAL',
  );
  const [reasonRequired, setReasonRequired] = useState(!!initial?.settings.reasonRequired);
  const [busy, setBusy] = useState(false);

  // 다른 양식을 고르면(휴가 화면에서 다시 읽힌 경우 등) 입력을 맞춘다
  useEffect(() => {
    setFields(initial?.fields ?? []);
    setSubstitute(initial?.settings.substitute ?? 'OPTIONAL');
    setReasonRequired(!!initial?.settings.reasonRequired);
  }, [initial]);

  const labelsOk = fields.every((f) => f.label.trim());
  const ready = (leave || !!name.trim()) && labelsOk;

  const save = async () => {
    setBusy(true);
    try {
      const body = leave
        ? { fields: cleanFieldsForSave(fields), settings: { substitute, reasonRequired } }
        : {
            name: name.trim(),
            category: category.trim() || null,
            description: description.trim() || null,
            isActive,
            fields: cleanFieldsForSave(fields),
          };
      await api(initial ? `/approval-forms/${initial.id}` : '/approval-forms', {
        method: initial ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      toast({ type: 'success', title: '저장했습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !initial ||
      !window.confirm(`'${initial.name}' 양식을 지울까요? 이미 올린 문서는 그대로 남습니다.`)
    )
      return;
    try {
      await api(`/approval-forms/${initial.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {onBack ? (
        <PageHeader
          title={leave ? '휴가 신청서' : initial ? initial.name : '새 결재 양식'}
          breadcrumbs={[{ label: backLabel, onClick: onBack }]}
          actions={
            <>
              {initial && !leave && (
                <Button variant="ghost" size="sm" onClick={() => void remove()}>
                  삭제
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                disabled={!ready}
                onClick={() => void save()}
              >
                저장
              </Button>
            </>
          }
        />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!ready}
            onClick={() => void save()}
          >
            저장
          </Button>
        </div>
      )}

      {leave ? (
        <section className="rd-card">
          <h3 className="rd-title">신청 설정</h3>
          <p className={styles.muted} style={{ margin: '0 0 12px' }}>
            휴가 종류·날짜(반차·반반차는 시간대)·사유는 기본으로 들어갑니다. 아래 항목은 그 뒤에
            붙습니다.
          </p>
          <div className={styles.formCol}>
            <div className={styles.fieldLabel}>
              업무 대리인
              <SegmentedControl
                size="sm"
                value={substitute}
                onChange={(v) => setSubstitute(v as SubstituteMode)}
                options={SUBSTITUTE_MODES.map((m) => ({
                  value: m,
                  label: SUBSTITUTE_MODE_LABEL[m],
                }))}
              />
              <span className={styles.muted} style={{ fontWeight: 400 }}>
                필수면 대리인을 골라야 신청할 수 있고, 승인되면 대리인에게 알림이 갑니다.
              </span>
            </div>
            <Checkbox
              checked={reasonRequired}
              onCheckedChange={(c) => setReasonRequired(c === true)}
              label="휴가 사유 필수"
            />
          </div>
        </section>
      ) : (
        <section className="rd-card">
          <h3 className="rd-title">기본 정보</h3>
          <div className={styles.formCol}>
            <div className={styles.lineAdd}>
              <label className={styles.fieldLabel} style={{ flex: '2 1 220px' }}>
                <span>
                  양식 이름 <span style={{ color: 'var(--ark-color-error-500)' }}>*</span>
                </span>
                <Input
                  value={name}
                  maxLength={60}
                  placeholder="예: 지출 결의서"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className={styles.fieldLabel} style={{ flex: '1 1 140px' }}>
                묶음
                <Input
                  value={category}
                  maxLength={30}
                  placeholder="예: 재무"
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.fieldLabel}>
              설명
              <Textarea
                rows={2}
                value={description}
                maxLength={300}
                placeholder="언제 쓰는 양식인지 — 새 결재 고르기 화면에 보입니다"
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Checkbox
              checked={isActive}
              onCheckedChange={(c) => setActive(c === true)}
              label="사용(직원이 고를 수 있음)"
            />
          </div>
        </section>
      )}

      <section className="rd-card">
        <h3 className="rd-title">{leave ? '추가 항목' : '항목'}</h3>
        <FormBuilder fields={fields} onChange={setFields} />
      </section>

      {!leave && (
        <p className={styles.muted}>
          이 양식의 기본 결재선은 「결재선 설정」에서 문서 종류 「양식 · {name || '이 양식'}」으로
          정합니다. 따로 정하지 않으면 일반 품의 결재선을 씁니다.
        </p>
      )}
    </div>
  );
}
