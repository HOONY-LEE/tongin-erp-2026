import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { api, ApiError } from '../../lib/api';
import {
  APPROVAL_STATUS_MAP,
  STEP_STATUS_MAP,
  notifyApprovalsChanged,
  personLabel,
  type ApprovalDocView,
} from '../../lib/approvals';
import { Button, Modal, RecordDetail, StatusBadge, Textarea, useToast } from '../ui';
import type { FormField, FormValue } from '@tongin/shared';
import { FormValuesView } from './FormFields';
import styles from './approval.module.css';

const dt = (v: string | null) => (v ? fmtDateTime(v) : null);

/** 업무 문서의 기본 본문 — 휴가·근태 정정은 payload를 표로, 그 외는 내용(content) */
function defaultBody(doc: ApprovalDocView): ReactNode {
  const p = (doc.payload ?? {}) as Record<string, unknown>;
  // 결재 양식 — 올릴 때의 항목 정의대로 값을 보여 준다
  if (doc.docType === 'FORM' && Array.isArray(p.fields)) {
    return (
      <FormValuesView
        fields={p.fields as FormField[]}
        values={(p.values ?? {}) as Record<string, FormValue>}
      />
    );
  }
  // 계약 금액 변경 — 바뀌는 값(이전 → 새 값)을 표로. 승인하면 계약서에 그대로 반영된다
  if (doc.docType === 'CONTRACT_PRICE' && Array.isArray(p.changes)) {
    const changes = p.changes as { label: string; from: string; to: string; price: boolean }[];
    return (
      <>
        <p className={styles.content}>
          {i18n.t('appr.contract')} {String(p.contractNo ?? '')}
          {p.customerName ? ` · ${String(p.customerName)}` : ''} {i18n.t('appr.contractApply1')}
          {i18n.t('appr.contractApply2')}
        </p>
        <dl className="rd-grid">
          {changes.map((c) => (
            <div key={c.label} className="rd-item rd-wide">
              <dt>{c.label}</dt>
              <dd>
                <span style={{ color: 'var(--ark-color-text-secondary)' }}>{c.from}</span>
                {' → '}
                <b style={{ color: c.price ? '#c93400' : undefined }}>{c.to}</b>
              </dd>
            </div>
          ))}
        </dl>
      </>
    );
  }
  const rows: [string, ReactNode][] = [];
  if (doc.docType === 'LEAVE') {
    rows.push([i18n.t('appr.leaveType'), String(p.leaveType ?? '-')]);
    rows.push([
      i18n.t('appr.period'),
      (p.startDate === p.endDate
        ? String(p.startDate)
        : `${String(p.startDate)} ~ ${String(p.endDate)}`) +
        (p.slotLabel ? ` · ${String(p.slotLabel)}` : ''),
    ]);
    rows.push([
      i18n.t('appr.days'),
      i18n.t('appr.daysN', {
        v0: String(p.days),
        v1: p.deducts === false ? i18n.t('appr.noDeduct') : '',
      }),
    ]);
    if (p.substituteName) rows.push([i18n.t('appr.delegate'), String(p.substituteName)]);
    if (p.handover) rows.push([i18n.t('appr.handover'), String(p.handover)]);
  } else if (doc.docType === 'ATTENDANCE_FIX') {
    rows.push([i18n.t('appr.date'), String(p.workDate ?? '-')]);
    rows.push([i18n.t('appr.in'), String(p.clockIn ?? '-')]);
    rows.push([i18n.t('appr.out'), String(p.clockOut ?? '-')]);
  }
  if (!rows.length) return doc.content ? <p className={styles.content}>{doc.content}</p> : null;
  return (
    <>
      <dl className="rd-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="rd-item">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {doc.content && (
        <p className={styles.content}>
          {i18n.t('appr.reasonColon')} {doc.content}
        </p>
      )}
      {/* 휴가 신청서에 관리자가 더한 항목 */}
      {doc.docType === 'LEAVE' && Array.isArray(p.fields) && p.fields.length > 0 && (
        <FormValuesView
          fields={p.fields as FormField[]}
          values={(p.values ?? {}) as Record<string, FormValue>}
        />
      )}
    </>
  );
}

/**
 * 결재 문서 상세 — 문서 정보, (업무별) 본문, 결재 진행 타임라인.
 * 내 결재 차례면 승인·반려, 내가 올린 문서면(결재 시작 전) 회수.
 */
export function ApprovalDetail({
  id,
  backLabel,
  onBack,
  onChanged,
  renderBody,
}: {
  id: string;
  backLabel: string;
  onBack: () => void;
  /** 승인·반려·회수 뒤 목록을 다시 읽게 */
  onChanged?: () => void;
  /** 문서 종류별 본문(휴가 기간·근태 정정 시각 등). 없으면 내용(content)만 */
  renderBody?: (doc: ApprovalDocView) => ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [doc, setDoc] = useState<ApprovalDocView | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDoc(await api<ApprovalDocView>(`/approvals/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('appr.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const after = (next: ApprovalDocView, msg: string) => {
    setDoc(next);
    toast({ type: 'success', title: msg });
    notifyApprovalsChanged();
    onChanged?.();
  };

  const act = async () => {
    if (!acting) return;
    if (acting === 'REJECT' && !comment.trim()) {
      toast({ type: 'warning', title: t('appr.rejectReasonReq') });
      return;
    }
    setBusy(true);
    try {
      const next = await api<ApprovalDocView>(`/approvals/${id}/act`, {
        method: 'POST',
        body: JSON.stringify({ action: acting, comment: comment.trim() || undefined }),
      });
      after(next, acting === 'APPROVE' ? t('appr.approvedOk') : t('appr.rejectedOk'));
      setActing(null);
      setComment('');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('appr.processFailed') });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm(t('appr.withdrawQ'))) return;
    try {
      after(
        await api<ApprovalDocView>(`/approvals/${id}/cancel`, { method: 'POST' }),
        t('appr.withdrawn'),
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('appr.withdrawFailed') });
    }
  };

  return (
    <>
      <RecordDetail
        loading={loading && !doc}
        title={doc ? doc.title : t('appr.notFound')}
        backLabel={backLabel}
        onBack={onBack}
        actions={
          doc ? (
            <>
              {doc.canCancel && (
                <Button variant="outline" size="sm" onClick={() => void cancel()}>
                  {t('appr.st.CANCELED')}
                </Button>
              )}
              {doc.canAct && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setActing('REJECT')}>
                    {t('appr.reject')}
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setActing('APPROVE')}>
                    {t('appr.approve')}
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
        sections={
          doc
            ? [
                {
                  title: t('appr.docInfo'),
                  items: [
                    { label: t('appr.docNo'), value: doc.docNo },
                    { label: t('appr.type'), value: doc.docTypeLabel },
                    {
                      label: t('appr.status'),
                      value: <StatusBadge value={doc.status} map={APPROVAL_STATUS_MAP} />,
                    },
                    { label: t('appr.requester'), value: personLabel(doc.requester) },
                    { label: t('appr.submitted'), value: dt(doc.submittedAt) },
                    {
                      label: doc.status === 'PENDING' ? t('appr.currentApprover') : t('appr.done'),
                      value:
                        doc.status === 'PENDING'
                          ? doc.currentApprover && personLabel(doc.currentApprover)
                          : dt(doc.completedAt),
                    },
                  ],
                },
              ]
            : []
        }
      >
        {doc && (
          <>
            {(() => {
              const body = renderBody?.(doc) ?? defaultBody(doc);
              return body ? (
                <section className="rd-card">
                  <h3 className="rd-title">{t('appr.content')}</h3>
                  {body}
                </section>
              ) : null;
            })()}
            <section className="rd-card">
              <h3 className="rd-title">{t('appr.progress')}</h3>
              <ol className={styles.timeline}>
                {doc.steps.map((s) => (
                  <li key={s.seq} className={styles.timelineItem}>
                    <span className={styles.timelineMeta}>
                      {s.kind === 'CC'
                        ? t('appr.cc')
                        : t('appr.stepN', {
                            v0: doc.steps.filter((x) => x.kind === 'APPROVER' && x.seq <= s.seq)
                              .length,
                          })}
                    </span>
                    <span>
                      <span className={styles.timelineWho}>{personLabel(s.approver)}</span>
                      {s.actedAt && <span className={styles.timelineMeta}> · {dt(s.actedAt)}</span>}
                    </span>
                    {s.kind === 'APPROVER' ? (
                      <StatusBadge value={s.status} map={STEP_STATUS_MAP} />
                    ) : (
                      <span />
                    )}
                    {s.comment && <div className={styles.timelineComment}>{s.comment}</div>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </RecordDetail>

      <Modal
        open={acting !== null}
        onOpenChange={(o) => !o && setActing(null)}
        title={acting === 'REJECT' ? t('appr.rejectQ') : t('appr.approveQ')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActing(null)}>
              {t('appr.cancel')}
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void act()}>
              {acting === 'REJECT' ? t('appr.reject') : t('appr.approve')}
            </Button>
          </>
        }
      >
        <label className={styles.fieldLabel}>
          {acting === 'REJECT' ? t('appr.rejectReason') : t('appr.comment')}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={acting === 'REJECT' ? t('appr.rejectPh') : t('appr.commentPh')}
          />
        </label>
      </Modal>
    </>
  );
}
