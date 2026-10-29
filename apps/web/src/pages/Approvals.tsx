import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  APPROVAL_STATUS_MAP,
  notifyApprovalsChanged,
  personLabel,
  toLinePayload,
  type ApprovalDocView,
  type ApprovalFormDef,
  type LineEntry,
} from '../lib/approvals';
import {
  Button,
  DataTable,
  Input,
  ListPage,
  Modal,
  SegmentedControl,
  StatusBadge,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { ApprovalDetail } from '../components/approval/ApprovalDetail';
import { ApprovalLineEditor } from '../components/approval/ApprovalLineEditor';
import { LineTemplates } from '../components/approval/LineTemplates';
import { FormsAdmin } from '../components/approval/FormsAdmin';
import { FormDraftModal, NewDocPicker } from '../components/approval/NewDocPicker';
import styles from '../components/approval/approval.module.css';

type Box = 'todo' | 'mine' | 'cc' | 'all' | 'forms' | 'lines';

const dt = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/**
 * 결재함 — 결재할 문서 / 내가 올린 문서 / 참조·처리한 문서 / 전체(APPROVAL.READ) / 결재선 설정(APPROVAL.MANAGE).
 * 휴가·근태 정정도 여기로 올라온다. '+ 품의 작성'으로 일반 품의를 올린다.
 */
export default function Approvals() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, can } = useAuth();
  // 처음엔 '전체'(나와 관련된 문서 모두) — 내 결재 차례인 문서는 맨 위에 굵게 보인다
  const { tab: box, setTab: setBox } = useTabParam<Box>('all', 'box');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const [rows, setRows] = useState<ApprovalDocView[]>([]);
  const [loading, setLoading] = useState(false);
  const [todoCount, setTodoCount] = useState(0);
  // 새 결재 — 고르기 → 일반 품의 / 결재 양식 작성
  const [writing, setWriting] = useState<'pick' | 'general' | ApprovalFormDef | null>(null);

  const load = useCallback(async () => {
    if (box === 'lines' || box === 'forms') return;
    setLoading(true);
    try {
      const [list, pc] = await Promise.all([
        api<ApprovalDocView[]>(`/approvals?box=${box}`),
        api<{ count: number }>('/approvals/pending-count'),
      ]);
      setRows(list);
      setTodoCount(pc.count);
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [box, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (detail.id) {
    return (
      <ApprovalDetail
        id={detail.id}
        backLabel={t('nav.approvals')}
        onBack={detail.close}
        onChanged={() => void load()}
      />
    );
  }

  const columns: Column[] = [
    { title: '문서 번호', dataIndex: 'docNo', width: 140 },
    { title: '종류', dataIndex: 'docTypeLabel', width: 100 },
    {
      title: '제목',
      dataIndex: 'title',
      flex: 1,
      minWidth: 200,
      // 내 결재 차례 — 안 읽은 메일처럼 굵게 + 점·'결재 차례' 표시(행 강조는 base.css .ap-turn)
      render: (r) =>
        (r as unknown as ApprovalDocView).canAct ? (
          <span className="ap-turn">
            <span className="ap-turn-dot" aria-hidden />
            {String(r.title)}
            <span className="ap-turn-tag">결재 차례</span>
          </span>
        ) : (
          String(r.title)
        ),
    },
    {
      title: '기안자',
      minWidth: 160,
      render: (r) => personLabel((r as unknown as ApprovalDocView).requester),
    },
    {
      title: '상태',
      width: 90,
      render: (r) => <StatusBadge value={String(r.status)} map={APPROVAL_STATUS_MAP} />,
    },
    {
      title: '결재할 사람',
      minWidth: 120,
      render: (r) => (r as unknown as ApprovalDocView).currentApprover?.name ?? '-',
    },
    { title: '상신', width: 130, render: (r) => dt(r.submittedAt) },
  ];

  const submitted = (doc: ApprovalDocView) => {
    setWriting(null);
    notifyApprovalsChanged();
    setBox('mine');
    detail.open(doc.id);
  };

  const options = [
    { value: 'all', label: '전체' },
    { value: 'todo', label: `결재할 문서${todoCount ? ` ${todoCount}` : ''}` },
    { value: 'mine', label: '내가 올린 문서' },
    { value: 'cc', label: '참조·처리한 문서' },
    ...(can('APPROVAL.MANAGE')
      ? [
          { value: 'forms', label: '결재 양식' },
          { value: 'lines', label: '결재선 설정' },
        ]
      : []),
  ];

  return (
    <ListPage
      title={t('nav.approvals')}
      onRefresh={load}
      updatedAt={updatedAt}
      footer={<SegmentedControl value={box} onChange={(v) => setBox(v as Box)} options={options} />}
    >
      {box === 'lines' ? (
        <LineTemplates />
      ) : box === 'forms' ? (
        <FormsAdmin />
      ) : (
        <DataTable
          columns={columns}
          rows={rows as unknown as Row[]}
          loading={loading}
          onRowClick={(r) => detail.open(String(r.id))}
          toolbarActions={
            user?.employeeId ? (
              <Button variant="primary" size="sm" onClick={() => setWriting('pick')}>
                + 새 결재
              </Button>
            ) : undefined
          }
        />
      )}
      {writing === 'pick' && (
        <NewDocPicker
          onClose={() => setWriting(null)}
          onGeneral={() => setWriting('general')}
          onPickForm={(f) => setWriting(f)}
        />
      )}
      {writing === 'general' && (
        <GeneralDraft
          myEmployeeId={user?.employeeId ?? null}
          onClose={() => setWriting(null)}
          onSubmitted={submitted}
        />
      )}
      {writing && typeof writing === 'object' && (
        <FormDraftModal
          form={writing}
          myEmployeeId={user?.employeeId ?? null}
          onClose={() => setWriting(null)}
          onSubmitted={submitted}
        />
      )}
    </ListPage>
  );
}

/** 일반 품의 작성 — 제목·내용 + 결재선 */
function GeneralDraft({
  myEmployeeId,
  onClose,
  onSubmitted,
}: {
  myEmployeeId: string | null;
  onClose: () => void;
  onSubmitted: (doc: ApprovalDocView) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [line, setLine] = useState<LineEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast({ type: 'warning', title: '제목을 입력하세요.' });
      return;
    }
    setBusy(true);
    try {
      const doc = await api<ApprovalDocView>('/approvals', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim() || undefined,
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
      title="품의 작성"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim()}
            onClick={() => void submit()}
          >
            상신
          </Button>
        </>
      }
    >
      <div className={styles.formCol}>
        <label className={styles.fieldLabel}>
          제목
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className={styles.fieldLabel}>
          내용
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
        </label>
        <ApprovalLineEditor
          docType="GENERAL"
          value={line}
          onChange={setLine}
          myEmployeeId={myEmployeeId}
        />
      </div>
    </Modal>
  );
}
