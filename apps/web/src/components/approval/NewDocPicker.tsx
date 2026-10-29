import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarOff, FileText, Search } from 'lucide-react';
import { useApprovalForms, type ApprovalFormDef } from '../../lib/approvals';
import { api, ApiError } from '../../lib/api';
import { toLinePayload, type ApprovalDocView, type LineEntry } from '../../lib/approvals';
import { Button, Input, Modal, useToast } from '../ui';
import { ApprovalLineEditor } from './ApprovalLineEditor';
import { FormFieldInputs, formReady, type FormDraft } from './FormFields';
import styles from './newDoc.module.css';
import astyles from './approval.module.css';

/**
 * 새 결재 — 어떤 문서를 올릴지 고른다. 일반 품의·휴가 신청 + 관리자가 만든 결재 양식(묶음별).
 * 고르면 일반 품의는 onGeneral, 양식은 그 양식 작성 창, 휴가는 휴가 화면으로.
 */
export function NewDocPicker({
  onClose,
  onGeneral,
  onPickForm,
}: {
  onClose: () => void;
  onGeneral: () => void;
  onPickForm: (form: ApprovalFormDef) => void;
}) {
  const navigate = useNavigate();
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
          <button type="button" className={styles.card} onClick={() => navigate('/leave?apply=1')}>
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
                  <FileText size={18} aria-hidden />
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

/** 결재 양식 작성 — 항목 채우기 + 결재선 → 상신 */
export function FormDraftModal({
  form,
  myEmployeeId,
  onClose,
  onSubmitted,
}: {
  form: ApprovalFormDef;
  myEmployeeId: string | null;
  onClose: () => void;
  onSubmitted: (doc: ApprovalDocView) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<FormDraft>({});
  const [line, setLine] = useState<LineEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = formReady(form.fields, values);

  const submit = async () => {
    setBusy(true);
    try {
      const doc = await api<ApprovalDocView>(`/approval-forms/${form.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
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
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void submit()}>
            상신
          </Button>
        </>
      }
    >
      <div className={astyles.formCol}>
        <label className={astyles.fieldLabel}>
          제목
          <Input
            value={title}
            maxLength={200}
            placeholder={`비워 두면 「${form.name} — 내 이름」`}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
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
