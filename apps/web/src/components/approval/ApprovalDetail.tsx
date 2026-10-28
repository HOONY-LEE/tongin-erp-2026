import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../lib/api';
import {
  APPROVAL_STATUS_MAP,
  STEP_STATUS_MAP,
  notifyApprovalsChanged,
  personLabel,
  type ApprovalDocView,
} from '../../lib/approvals';
import { Button, Modal, RecordDetail, StatusBadge, Textarea, useToast } from '../ui';
import styles from './approval.module.css';

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : null;

/** 업무 문서의 기본 본문 — 휴가·근태 정정은 payload를 표로, 그 외는 내용(content) */
function defaultBody(doc: ApprovalDocView): ReactNode {
  const p = (doc.payload ?? {}) as Record<string, unknown>;
  const rows: [string, ReactNode][] = [];
  if (doc.docType === 'LEAVE') {
    rows.push(['휴가 종류', String(p.leaveType ?? '-')]);
    rows.push([
      '기간',
      p.startDate === p.endDate
        ? String(p.startDate)
        : `${String(p.startDate)} ~ ${String(p.endDate)}`,
    ]);
    rows.push(['일수', `${String(p.days)}일${p.deducts === false ? ' (연차 차감 없음)' : ''}`]);
  } else if (doc.docType === 'ATTENDANCE_FIX') {
    rows.push(['날짜', String(p.workDate ?? '-')]);
    rows.push(['출근', String(p.clockIn ?? '-')]);
    rows.push(['퇴근', String(p.clockOut ?? '-')]);
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
      {doc.content && <p className={styles.content}>사유: {doc.content}</p>}
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
      toast({ type: 'warning', title: '반려 사유를 적어 주세요.' });
      return;
    }
    setBusy(true);
    try {
      const next = await api<ApprovalDocView>(`/approvals/${id}/act`, {
        method: 'POST',
        body: JSON.stringify({ action: acting, comment: comment.trim() || undefined }),
      });
      after(next, acting === 'APPROVE' ? '승인했습니다' : '반려했습니다');
      setActing(null);
      setComment('');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('이 문서를 회수할까요? 결재선에서 빠지고 진행이 멈춥니다.')) return;
    try {
      after(
        await api<ApprovalDocView>(`/approvals/${id}/cancel`, { method: 'POST' }),
        '회수했습니다',
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '회수하지 못했습니다' });
    }
  };

  return (
    <>
      <RecordDetail
        loading={loading && !doc}
        title={doc ? doc.title : '문서를 찾을 수 없습니다'}
        backLabel={backLabel}
        onBack={onBack}
        actions={
          doc ? (
            <>
              {doc.canCancel && (
                <Button variant="outline" size="sm" onClick={() => void cancel()}>
                  회수
                </Button>
              )}
              {doc.canAct && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setActing('REJECT')}>
                    반려
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setActing('APPROVE')}>
                    승인
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
                  title: '문서 정보',
                  items: [
                    { label: '문서 번호', value: doc.docNo },
                    { label: '종류', value: doc.docTypeLabel },
                    {
                      label: '상태',
                      value: <StatusBadge value={doc.status} map={APPROVAL_STATUS_MAP} />,
                    },
                    { label: '기안자', value: personLabel(doc.requester) },
                    { label: '상신', value: dt(doc.submittedAt) },
                    {
                      label: doc.status === 'PENDING' ? '지금 결재할 사람' : '완료',
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
                  <h3 className="rd-title">내용</h3>
                  {body}
                </section>
              ) : null;
            })()}
            <section className="rd-card">
              <h3 className="rd-title">결재 진행</h3>
              <ol className={styles.timeline}>
                {doc.steps.map((s) => (
                  <li key={s.seq} className={styles.timelineItem}>
                    <span className={styles.timelineMeta}>
                      {s.kind === 'CC'
                        ? '참조'
                        : `결재 ${doc.steps.filter((x) => x.kind === 'APPROVER' && x.seq <= s.seq).length}`}
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
        title={acting === 'REJECT' ? '반려할까요?' : '승인할까요?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActing(null)}>
              취소
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void act()}>
              {acting === 'REJECT' ? '반려' : '승인'}
            </Button>
          </>
        }
      >
        <label className={styles.fieldLabel}>
          {acting === 'REJECT' ? '반려 사유 (필수)' : '의견 (선택)'}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={acting === 'REJECT' ? '기안자에게 보일 사유' : '남길 말이 있으면'}
          />
        </label>
      </Modal>
    </>
  );
}
