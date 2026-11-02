import { useEffect, useMemo, useState } from 'react';
import { Combobox } from '@sunghoon_lee/akron-ui';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import {
  DEFAULT_FORM_AUDIENCE,
  SUBSTITUTE_MODES,
  SUBSTITUTE_MODE_LABEL,
  type ApprovalLineRule,
  type FormAudience,
  type FormField,
  type SubstituteMode,
} from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { useDetailParam } from '../../lib/useDetailParam';
import { useAuth } from '../../auth/AuthContext';
import { FormDraftModal } from './NewDocPicker';
import { useApprovalForms, useDirectory, type ApprovalFormDef } from '../../lib/approvals';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Input,
  PageHeader,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../ui';
import {
  FormBuilder,
  FormFieldInputs,
  PersonPicker,
  cleanFieldsForSave,
  formReady,
  previewFields,
} from './FormFields';
import { EMPTY_RULE, LineStepsEditor, useRuleText } from './LineTemplates';
import styles from './approval.module.css';
import cstyles from '../../pages/campaign.module.css';
import fstyles from './formFields.module.css';

/**
 * 결재 양식 관리(APPROVAL.MANAGE) — 지출 결의·구매 품의처럼 회사마다 다른 신청서를 항목으로 정의한다.
 * 양식 편집에서 공개 대상·기본 결재선까지 함께 정한다.
 */
export function FormsAdmin({ urlKey }: { urlKey?: string } = {}) {
  const { forms, loading, reload } = useApprovalForms(true);
  const { orgs, people } = useDirectory();
  // 결재함에서는 편집 중인 양식을 주소(?form=<id>|new)에 둔다 — 결재함 머리글을 숨기고 뒤로가기도 된다.
  // 설정 창 안에서는 주소를 건드리지 않게 화면 안에서만 기억한다
  const param = useDetailParam(urlKey ?? '__unused');
  const [localEditing, setLocalEditing] = useState<ApprovalFormDef | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<ApprovalFormDef | null>(null);
  const { user } = useAuth();
  const editing: ApprovalFormDef | 'new' | null = urlKey
    ? param.id === 'new'
      ? 'new'
      : (forms.find((f) => f.id === param.id) ?? null)
    : localEditing;
  const setEditing = (v: ApprovalFormDef | 'new' | null) => {
    if (!urlKey) return setLocalEditing(v);
    if (v) param.open(v === 'new' ? 'new' : v.id);
    else param.close();
  };
  const custom = forms.filter((f) => f.kind === 'CUSTOM');
  const orgName = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const personName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  // 주소로 바로 열었는데 목록을 아직 못 읽었으면 잠깐 비워 둔다(목록이 번쩍 보이지 않게)
  if (urlKey && param.id && !editing && loading) return null;

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

  const audienceText = (a: FormAudience) =>
    a.mode === 'ALL'
      ? '전 직원'
      : [
          ...a.orgIds.map((id) => orgName.get(id) ?? '?'),
          ...a.employeeIds.map((id) => personName.get(id) ?? '?'),
        ].join(', ');

  const columns: Column[] = [
    { title: '양식', dataIndex: 'name', minWidth: 180 },
    { title: '분류', dataIndex: 'category', width: 110 },
    { title: '설명', dataIndex: 'description', flex: 1, minWidth: 200 },
    {
      title: '공개 대상',
      minWidth: 140,
      render: (r) => audienceText((r.audience as FormAudience) ?? DEFAULT_FORM_AUDIENCE),
    },
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
    <>
      <DataTable
        columns={columns}
        rows={custom as unknown as Row[]}
        loading={loading}
        // 행을 누르면 직원이 보게 될 상신 창 그대로 — 거기서 편집하기 / 바로 결재 올리기
        onRowClick={(r) => setPreviewing(r as unknown as ApprovalFormDef)}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            + 새 양식
          </Button>
        }
      />
      {previewing && (
        <FormDraftModal
          key={previewing.id}
          form={previewing}
          myEmployeeId={user?.employeeId ?? null}
          onClose={() => setPreviewing(null)}
          onSubmitted={() => setPreviewing(null)}
          onEdit={() => {
            const f = previewing;
            setPreviewing(null);
            setEditing(f);
          }}
        />
      )}
    </>
  );
}

type LineMode = 'GENERAL' | 'CUSTOM';

/**
 * 양식 편집 — 왼쪽: 기본 정보·공개 대상·결재선·항목, 오른쪽: 직원이 보게 될 상신 창 미리보기.
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
  const { forms: allForms } = useApprovalForms(true);
  const [fields, setFields] = useState<FormField[]>(initial?.fields ?? []);
  const [audience, setAudience] = useState<FormAudience>(
    initial?.audience ?? DEFAULT_FORM_AUDIENCE,
  );
  const [lineMode, setLineMode] = useState<LineMode>('GENERAL');
  const [steps, setSteps] = useState<ApprovalLineRule[]>([EMPTY_RULE]);
  const [substitute, setSubstitute] = useState<SubstituteMode>(
    initial?.settings.substitute ?? 'OPTIONAL',
  );
  const [reasonRequired, setReasonRequired] = useState(!!initial?.settings.reasonRequired);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  // 다른 양식을 고르면(휴가 화면에서 다시 읽힌 경우 등) 입력을 맞춘다
  useEffect(() => {
    setFields(initial?.fields ?? []);
    setSubstitute(initial?.settings.substitute ?? 'OPTIONAL');
    setReasonRequired(!!initial?.settings.reasonRequired);
  }, [initial]);

  // 기본 결재선은 목록에 없어 따로 읽는다
  useEffect(() => {
    if (!initial || leave) return;
    void api<ApprovalFormDef>(`/approval-forms/${initial.id}?detail=1`)
      .then((d) => {
        if (d.line?.length) {
          setLineMode('CUSTOM');
          setSteps(d.line);
        }
      })
      .catch(() => undefined);
  }, [initial, leave]);

  const labelsOk = fields.every((f) => f.label.trim());
  const audienceOk =
    audience.mode === 'ALL' || audience.orgIds.length + audience.employeeIds.length > 0;
  const ready = leave ? labelsOk : !!name.trim() && labelsOk && audienceOk;

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
            audience,
            // 빈 배열 = 일반 품의 결재선을 따른다
            line: lineMode === 'CUSTOM' ? steps : [],
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

  /** 사용 중지 — 직원의 「+ 새 결재」에서 빠진다(이미 올린 문서는 그대로). 바로 저장 */
  const toggleActive = async () => {
    if (!initial) return;
    try {
      await api(`/approval-forms/${initial.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !isActive }),
      });
      setActive(!isActive);
      toast({
        type: 'success',
        title: isActive ? '사용을 멈췄습니다 — 직원 목록에서 빠집니다' : '다시 사용합니다',
      });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '바꾸지 못했습니다' });
    }
  };

  const saveBtn = (
    <Button
      variant="primary"
      size="sm"
      loading={busy}
      disabled={!ready}
      onClick={() => void save()}
    >
      저장
    </Button>
  );

  const header = onBack ? (
    <PageHeader
      title={
        leave
          ? '휴가 신청서'
          : initial
            ? `${initial.name}${isActive ? '' : ' (사용 안 함)'}`
            : '새 결재 양식'
      }
      breadcrumbs={[{ label: backLabel, onClick: onBack }]}
      hideBreadcrumbs
      actions={
        <>
          {initial && !leave && (
            <>
              <Button variant="ghost" size="sm" onClick={() => void remove()}>
                삭제
              </Button>
              <Button variant="outline" size="sm" onClick={() => void toggleActive()}>
                {isActive ? '사용 중지' : '다시 사용'}
              </Button>
            </>
          )}
          {saveBtn}
        </>
      }
    />
  ) : (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{saveBtn}</div>
  );

  // 휴가 신청서 — 신청 설정 + 추가 항목(미리보기는 항목 옆)
  if (leave) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {header}
        <section className="rd-card">
          <h3 className="rd-title">신청 설정</h3>
          <p className={styles.muted} style={{ margin: '0 0 12px' }}>
            휴가 종류·날짜(반차·반반차는 시간대)·사유는 기본으로 들어갑니다. 아래 항목은 그 뒤에
            붙습니다.
          </p>
          <div className={styles.formCol}>
            <div className={styles.fieldLabel}>
              업무 대리인
              <ChoiceChips
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
        <section className="rd-card">
          <h3 className="rd-title">추가 항목</h3>
          <FormBuilder fields={fields} onChange={setFields} />
        </section>
      </div>
    );
  }

  const step1Ready = !!name.trim() && labelsOk;
  const STEPS = ['양식 만들기', '공개 대상 · 결재선'] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {header}
      {/* 캠페인 작성처럼 단계로 — 1) 이름·분류·설명·항목 2) 공개 대상·결재선 */}
      <ol className={cstyles.steps}>
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={`${cstyles.stepItem} ${step === i + 1 ? cstyles.stepOn : ''} ${step > i + 1 ? cstyles.stepDone : ''}`}
              onClick={() => (i === 0 || step1Ready ? setStep((i + 1) as 1 | 2) : undefined)}
              disabled={i === 1 && !step1Ready}
              aria-current={step === i + 1 ? 'step' : undefined}
            >
              <span className={cstyles.stepNo}>{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.formEditorGrid}>
        {/* 왼쪽 — 결재 양식 만들기(한 상자, 구획은 경계선으로) */}
        <section className={`${cstyles.panel} ${styles.builderPanel}`}>
          {step === 1 ? (
            <>
              <div className={styles.builderBlock}>
                <h3 className={cstyles.panelTitle}>기본 정보</h3>
                <label className={styles.fieldLabel}>
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
                <div className={styles.fieldLabel}>
                  분류{' '}
                  <span className={styles.muted}>「+ 새 결재」에서 이 분류로 묶여 보입니다</span>
                  <CategoryPicker
                    value={category}
                    onChange={setCategory}
                    existing={allForms
                      .filter((f) => f.kind === 'CUSTOM' && f.category)
                      .map((f) => f.category as string)}
                  />
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
              </div>
              <div className={styles.builderBlock}>
                <h3 className={cstyles.panelTitle}>항목</h3>
                <FormBuilder fields={fields} onChange={setFields} hidePreview />
              </div>
              <div className={cstyles.stepNav}>
                <Button variant="primary" disabled={!step1Ready} onClick={() => setStep(2)}>
                  다음: 공개 대상·결재선 →
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.builderBlock}>
                <h3 className={cstyles.panelTitle}>공개 대상</h3>
                <ChoiceChips
                  value={audience.mode}
                  onChange={(v) => setAudience({ ...audience, mode: v as FormAudience['mode'] })}
                  options={[
                    { value: 'ALL', label: '전 직원' },
                    { value: 'SOME', label: '고른 조직·직원만' },
                  ]}
                />
                {audience.mode === 'SOME' && (
                  <>
                    <div className={styles.fieldLabel}>
                      조직 <span className={styles.muted}>하위 조직까지 함께 봅니다</span>
                      <OrgPicker
                        value={audience.orgIds}
                        onChange={(orgIds) => setAudience({ ...audience, orgIds })}
                      />
                    </div>
                    <div className={styles.fieldLabel}>
                      직원
                      <PersonPicker
                        value={audience.employeeIds}
                        onChange={(employeeIds) => setAudience({ ...audience, employeeIds })}
                      />
                    </div>
                    {!audienceOk && (
                      <span
                        className={styles.muted}
                        style={{ color: 'var(--ark-color-error-500)' }}
                      >
                        조직이나 직원을 하나 이상 고르세요.
                      </span>
                    )}
                  </>
                )}
                <span className={styles.muted}>
                  고른 사람만 「+ 새 결재」에서 이 양식을 봅니다. 결재 양식 관리자는 늘 봅니다.
                </span>
              </div>
              <div className={styles.builderBlock}>
                <h3 className={cstyles.panelTitle}>결재선</h3>
                <ChoiceChips
                  value={lineMode}
                  onChange={(v) => setLineMode(v as LineMode)}
                  options={[
                    { value: 'GENERAL', label: '일반 품의 결재선 따르기' },
                    { value: 'CUSTOM', label: '이 양식 결재선 정하기' },
                  ]}
                />
                {lineMode === 'CUSTOM' ? (
                  <>
                    <span className={styles.muted}>
                      결재는 위에서부터 차례로, 참조는 순서와 무관합니다. 상신하는 사람에 따라
                      부서장이 정해지고, 상신할 때 고칠 수 있습니다.
                    </span>
                    <LineStepsEditor steps={steps} onChange={setSteps} />
                  </>
                ) : (
                  <span className={styles.muted}>
                    「결재선 설정」의 일반 품의 결재선(없으면 부서장 결재 한 단계)을 씁니다.
                  </span>
                )}
              </div>
              <div className={cstyles.stepNav}>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  ← 양식 수정
                </Button>
                <Button
                  variant="primary"
                  loading={busy}
                  disabled={!ready}
                  onClick={() => void save()}
                >
                  저장
                </Button>
              </div>
            </>
          )}
        </section>

        {/* 오른쪽 — 미리보기 상자 안에 실제 상신 창(모달) */}
        <section className={`${cstyles.panel} ${styles.formEditorSide}`} aria-label="미리보기">
          <h3 className={cstyles.panelTitle}>미리보기</h3>
          <div className={styles.previewStage}>
            <SubmitPreview
              name={name}
              description={description}
              fields={fields}
              steps={lineMode === 'CUSTOM' ? steps : null}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * 상신 창 미리보기 — 「+ 새 결재」에서 이 양식을 고르면 뜨는 창과 같은 크기(720px)·모양.
 * 입력·첨부는 해 볼 수 있지만 올라가지 않고, 상신 버튼은 필수 항목이 다 차면 켜지는 것까지 같다.
 */
function SubmitPreview({
  name,
  description,
  fields,
  steps,
}: {
  name: string;
  description: string;
  fields: FormField[];
  steps: ApprovalLineRule[] | null;
}) {
  const toast = useToast();
  const ruleText = useRuleText();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const shown = previewFields(fields);
  const approvers = (steps ?? [EMPTY_RULE]).filter((s) => s.kind === 'APPROVER');
  const ccs = (steps ?? []).filter((s) => s.kind === 'CC');
  const ready = formReady(shown, values);
  const tryIt = () => toast({ type: 'info', title: '미리보기입니다 — 실제로 올라가지 않습니다' });
  return (
    <div className={styles.mockModal} role="presentation">
      <div className={styles.mockHead}>
        <div>
          <h2>{name.trim() || '양식 이름'}</h2>
          {description.trim() && <p>{description.trim()}</p>}
        </div>
        <button
          type="button"
          className={styles.mockClose}
          aria-label="닫기(미리보기)"
          onClick={tryIt}
        >
          <X size={16} />
        </button>
      </div>
      <div className={styles.mockBody}>
        <div className={styles.formCol}>
          <FormFieldInputs fields={shown} values={values} onChange={setValues} preview />
          {!shown.length && <p className={fstyles.hint}>항목을 넣으면 여기에 보입니다.</p>}
          <div className={styles.lineEditor}>
            <div className={styles.lineHead}>
              <span>결재선</span>
              <span className={styles.muted}>
                {steps
                  ? `기본: ${name.trim() || '이 양식'} 기본 — 바꿔서 올릴 수 있습니다`
                  : '기본 결재선(일반 품의) — 바꿔서 올릴 수 있습니다'}
              </span>
            </div>
            <ol className={styles.lineList}>
              {approvers.map((s, i) => (
                <li key={`a${i}`} className={styles.lineRow}>
                  <Badge variant="subtle" color="info">
                    결재 {i + 1}
                  </Badge>
                  <span className={styles.lineName}>
                    {ruleText(s)}
                    {s.resolver === 'DEPT_HEAD' && (
                      <span className={styles.muted}> · 상신하는 사람에 따라 정해짐</span>
                    )}
                  </span>
                  <span className={styles.lineActions}>
                    <button type="button" aria-label="앞으로" disabled={i === 0}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" aria-label="뒤로" disabled={i === approvers.length - 1}>
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" aria-label="빼기">
                      <X size={14} />
                    </button>
                  </span>
                </li>
              ))}
              {ccs.map((s, i) => (
                <li key={`c${i}`} className={styles.lineRow}>
                  <Badge variant="subtle" color="neutral">
                    참조
                  </Badge>
                  <span className={styles.lineName}>{ruleText(s)}</span>
                  <span className={styles.lineActions}>
                    <button type="button" aria-label="빼기">
                      <X size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <div className={styles.lineAdd}>
              <div className={styles.lineAddPicker}>
                <Combobox
                  options={[]}
                  value={null}
                  onChange={() => undefined}
                  placeholder="직원 찾기(이름)"
                  size="sm"
                />
              </div>
              <Button size="sm" variant="outline" disabled>
                결재자로 추가
              </Button>
              <Button size="sm" variant="ghost" disabled>
                참조로 추가
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.mockDivider} />
      <div className={styles.mockFoot}>
        <Button variant="ghost" onClick={tryIt}>
          취소
        </Button>
        <Button variant="primary" disabled={!ready} onClick={tryIt}>
          상신
        </Button>
      </div>
    </div>
  );
}

/** 조직 여러 개 고르기 — 칩 + 검색 */
function OrgPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { orgs } = useDirectory();
  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const options = useMemo(
    () =>
      orgs
        .filter((o) => !value.includes(o.id))
        .map((o) => ({
          value: o.id,
          label: o.name,
          description: o.type === 'BRANCH' ? '지점' : undefined,
        })),
    [orgs, value],
  );
  return (
    <div className={fstyles.people}>
      {value.map((id) => (
        <span key={id} className={fstyles.chip}>
          {byId.get(id)?.name ?? '…'}
          <button
            type="button"
            aria-label="빼기"
            onClick={() => onChange(value.filter((x) => x !== id))}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <Combobox
        options={options}
        value={null}
        placeholder="조직 찾기"
        searchPlaceholder="조직 이름으로 찾기"
        onChange={(v) => v && onChange([...value, v])}
      />
    </div>
  );
}

/** 하나 고르기 — 내용 폭만큼의 칩(세그먼트처럼 줄 전체를 차지하지 않는다) */
function ChoiceChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className={styles.choiceChips} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${styles.choiceChip} ${value === o.value ? styles.choiceChipOn : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 분류 고르기 — 이미 쓰는 분류를 칩으로 고르고, 없으면 「+ 새 분류」로 더한다.
 * 글자를 매번 손으로 치면 '재무'·'재무팀'처럼 갈라져 묶음 기준이 흐트러진다.
 */
function CategoryPicker({
  value,
  onChange,
  existing,
}: {
  value: string;
  onChange: (v: string) => void;
  existing: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const list = [...new Set([...existing, ...(value ? [value] : [])])].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
  const commit = () => {
    const v = draft.trim();
    if (v) onChange(v);
    setDraft('');
    setAdding(false);
  };
  return (
    <div className={styles.choiceChips}>
      <button
        type="button"
        className={`${styles.choiceChip} ${!value ? styles.choiceChipOn : ''}`}
        onClick={() => onChange('')}
      >
        기타
      </button>
      {list.map((c) => (
        <button
          key={c}
          type="button"
          className={`${styles.choiceChip} ${value === c ? styles.choiceChipOn : ''}`}
          onClick={() => onChange(c)}
        >
          {c}
        </button>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={draft}
          maxLength={30}
          placeholder="새 분류 이름"
          style={{ width: 150, height: 32 }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
        />
      ) : (
        <button type="button" className={styles.choiceChipAdd} onClick={() => setAdding(true)}>
          + 새 분류
        </button>
      )}
    </div>
  );
}
