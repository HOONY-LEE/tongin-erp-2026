import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, CalendarOff, FileText, Search } from 'lucide-react';
import { useApprovalForms, type ApprovalFormDef } from '../../lib/approvals';
import { api, ApiError } from '../../lib/api';
import { toLinePayload, type ApprovalDocView, type LineEntry } from '../../lib/approvals';
import { Button, Input, Modal, useToast } from '../ui';
import { ApprovalLineEditor } from './ApprovalLineEditor';
import { FormFieldInputs, formReady, type FormDraft } from './FormFields';
import { formIcon } from '../../lib/formIcons';
import styles from './newDoc.module.css';
import astyles from './approval.module.css';

/**
 * 새 결재 — 어떤 문서를 올릴지 고른다. 일반 품의·휴가 신청 + 관리자가 만든 결재 양식(묶음별).
 * 고르면 일반 품의는 onGeneral, 양식은 그 양식 작성 창, 휴가는 휴가 화면으로.
 */
export function NewDocPicker({
  onClose,
  onGeneral,
  onLeave,
  onPickForm,
}: {
  onClose: () => void;
  onGeneral: () => void;
  /** 휴가 신청 창 열기(결재함 안에서) */
  onLeave: () => void;
  onPickForm: (form: ApprovalFormDef) => void;
}) {
  const { forms, loading } = useApprovalForms();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const kw = q.trim();
    const shown = forms.filter(
      (f) => !kw || f.name.includes(kw) || (f.description ?? '').includes(kw),
    );
    const map = new Map<string, ApprovalFormDef[]>();
    for (const f of shown)
      map.set(f.category || '기타', [...(map.get(f.category || '기타') ?? []), f]);
    return [...map];
  }, [forms, q]);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title="새 결재">
      <div className={styles.search}>
        <Search size={15} aria-hidden />
        <Input value={q} placeholder="양식 찾기" onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className={styles.group}>
        <div className={styles.groupLabel}>기본</div>
        <div className={styles.grid}>
          <button type="button" className={styles.card} onClick={onGeneral}>
            <FileText size={18} aria-hidden />
            <b>일반 품의</b>
            <span>제목과 내용을 자유롭게 써서 올립니다</span>
          </button>
          <button type="button" className={styles.card} onClick={onLeave}>
            <CalendarOff size={18} aria-hidden />
            <b>휴가 신청</b>
            <span>연차·반차·반반차 — 휴가 화면에서 남은 연차를 보며 신청</span>
          </button>
        </div>
      </div>
      {loading ? (
        <p className={styles.empty}>양식을 불러오는 중…</p>
      ) : groups.length === 0 ? (
        <p className={styles.empty}>
          {q ? '맞는 양식이 없습니다.' : '관리자가 만든 결재 양식이 아직 없습니다.'}
        </p>
      ) : (
        groups.map(([cat, list]) => (
          <div key={cat} className={styles.group}>
            <div className={styles.groupLabel}>{cat}</div>
            <div className={styles.grid}>
              {list.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={styles.card}
                  onClick={() => onPickForm(f)}
                >
                  <FormIconView name={f.icon} />
                  <b>{f.name}</b>
                  <span>{f.description || `항목 ${f.fields.length}개`}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}

const FormIconView = ({ name }: { name?: string | null }) => {
  const Icon = formIcon(name);
  return <Icon size={18} aria-hidden />;
};

/**
 * 결재함 위 「바로 신청하기」 — 일반 품의·휴가 신청·쓸 수 있는 결재 양식을 카드로(새 결재 창을 열지 않고 바로)
 */
export function QuickApply({
  onGeneral,
  onLeave,
  onPickForm,
}: {
  onGeneral: () => void;
  onLeave: () => void;
  onPickForm: (form: ApprovalFormDef) => void;
}) {
  const { forms } = useApprovalForms();
  const cards: { key: string; name: string; desc: string; icon: ReactNode; onClick: () => void }[] =
    [
      {
        key: 'general',
        name: '일반 품의',
        desc: '제목·내용을 자유롭게',
        icon: <FileText size={20} aria-hidden />,
        onClick: onGeneral,
      },
      {
        key: 'leave',
        name: '휴가 신청',
        desc: '연차·반차·반반차',
        icon: <CalendarOff size={20} aria-hidden />,
        onClick: onLeave,
      },
      ...forms.map((f) => {
        const Icon = formIcon(f.icon);
        return {
          key: f.id,
          name: f.name,
          desc: f.description || `${f.category || '결재 양식'} · 항목 ${f.fields.length}개`,
          icon: <Icon size={20} aria-hidden />,
          onClick: () => onPickForm(f),
        };
      }),
    ];
  return (
    <div
      className={styles.quick}
      aria-label="바로 신청하기"
      // 한 줄에 다 놓는다(8개까지) — 더 많으면 두 줄로 고르게
      style={{ ['--n' as string]: cards.length <= 8 ? cards.length : Math.ceil(cards.length / 2) }}
    >
      {cards.map((c, i) => (
        <button
          key={c.key}
          type="button"
          className={styles.quickCard}
          style={{ ['--qc' as string]: QUICK_COLORS[i % QUICK_COLORS.length] }}
          title={c.desc}
          onClick={c.onClick}
        >
          <span className={styles.quickIcon}>{c.icon}</span>
          <span className={styles.quickText}>
            <b>{c.name}</b>
            <span>{c.desc}</span>
          </span>
          <ArrowUpRight size={15} className={styles.quickArrow} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** 바로 신청하기 카드 아이콘 색(차례대로) — 통인 주황부터 */
const QUICK_COLORS = [
  '#f97316',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#eab308',
  '#ef4444',
];

/** 결재 양식 작성 — 항목 채우기 + 결재선 → 상신. 제목은 따로 받지 않는다(「양식 이름 — 올린 사람」으로 서버가 붙인다) */
export function FormDraftModal({
  form,
  myEmployeeId,
  onClose,
  onSubmitted,
  onEdit,
}: {
  form: ApprovalFormDef;
  myEmployeeId: string | null;
  onClose: () => void;
  onSubmitted: (doc: ApprovalDocView) => void;
  /** 결재 양식 목록에서 열었을 때 — 왼쪽 아래 「결재 양식 편집하기」 */
  onEdit?: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<FormDraft>({});
  const [line, setLine] = useState<LineEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = formReady(form.fields, values);
  // 올릴 수 없는 이유(관리 화면에서 미리 볼 때) — 버튼을 막고 이유를 보인다
  const blocked = !myEmployeeId
    ? '직원과 연결된 계정만 결재를 올릴 수 있습니다'
    : !form.isActive
      ? '사용 중지된 양식입니다'
      : null;

  const submit = async () => {
    setBusy(true);
    try {
      const doc = await api<ApprovalDocView>(`/approval-forms/${form.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          values,
          line: line ? toLinePayload(line) : undefined,
        }),
      });
      toast({ type: 'success', title: '상신했습니다' });
      onSubmitted(doc);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '올리지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={form.name}
      description={form.description ?? undefined}
      footer={
        <>
          {onEdit && (
            <Button variant="outline" onClick={onEdit} style={{ marginRight: 'auto' }}>
              결재 양식 편집하기
            </Button>
          )}
          {blocked && <span className={astyles.muted}>{blocked}</span>}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready || !!blocked}
            onClick={() => void submit()}
          >
            {onEdit ? '결재 올리기' : '상신'}
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <FormFieldInputs fields={form.fields} values={values} onChange={setValues} />
        <ApprovalLineEditor
          docType={`FORM:${form.id}`}
          value={line}
          onChange={setLine}
          myEmployeeId={myEmployeeId}
        />
      </div>
    </Modal>
  );
}
