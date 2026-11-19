import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Check, FileText, UserRound } from 'lucide-react';
import { Phone as PhoneCell } from 'softium-ui/table';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { dial, enablePhone, getPhoneState, usePhone } from '../../lib/softphone';
import {
  Button,
  DataTable,
  Input,
  Modal,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../../components/ui';
import styles from '../callcenter.module.css';

export type FollowupKind = 'CONFIRM' | 'HAPPY';
interface FollowupRow {
  leadId: string;
  leadNo: string;
  status: string;
  customerName: string | null;
  phone: string | null;
  orgName: string | null;
  ownerName: string | null;
  partnerName: string | null;
  moveDate: string;
  tries: number;
  result: 'DONE' | 'NO_ANSWER' | null;
  memo: string | null;
  at: string | null;
  by: string | null;
}
const LABEL: Record<FollowupKind, { title: string; when: string; guide: string }> = {
  CONFIRM: {
    title: '이사 확인콜',
    when: '이사 2일 전',
    guide:
      '안녕하세요, 통인익스프레스입니다. ○○일 이사 예정이셔서 확인차 연락드렸습니다. 이사 시간·주소·짐 변동 사항 있으실까요?',
  },
  HAPPY: {
    title: '해피콜',
    when: '이사 다음 날',
    guide:
      '안녕하세요, 통인익스프레스입니다. 어제 이사는 잘 마치셨을까요? 작업 중 불편하셨던 점이나 파손·분실된 물건은 없으신지 여쭤보려고 연락드렸습니다.',
  },
};
const RESULT: Record<string, string> = { DONE: '통화 완료', NO_ANSWER: '부재' };

/**
 * 이사 확인콜(이사 2일 전)·해피콜(이사 다음 날) 목록 — 날짜를 바꿔 볼 수 있다.
 * 행을 누르면 통화 창: 전화 걸기, 결과(통화 완료·부재)와 메모를 남긴다.
 */
export function FollowupList({
  kind,
  onChanged,
  viewSwitch,
}: {
  kind: FollowupKind;
  onChanged?: () => void;
  /** 검색 줄 오른쪽 끝(목록 바꾸는 탭) */
  viewSwitch?: ReactNode;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const phone = usePhone();
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<FollowupRow | null>(null);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ date: string; rows: FollowupRow[] }>(
        `/cs-followups?kind=${kind}${date ? `&date=${date}` : ''}`,
      );
      setRows(r.rows);
      if (!date) setDate(r.date);
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다',
      });
    } finally {
      setLoading(false);
    }
  }, [kind, date, toast]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setDate(''), [kind]);

  const call = async (r: FollowupRow) => {
    if (!r.phone) return;
    if (getPhoneState().status !== 'ready') {
      await enablePhone();
      if (getPhoneState().status === 'error') return;
    }
    dial(r.phone);
  };
  const save = async (result: 'DONE' | 'NO_ANSWER') => {
    if (!open) return;
    setBusy(true);
    try {
      await api('/cs-followups', {
        method: 'POST',
        body: JSON.stringify({ leadId: open.leadId, kind, result, memo: memo || undefined }),
      });
      toast({ type: 'success', title: `${RESULT[result]}으로 남겼습니다` });
      setOpen(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column[] = [
    {
      title: '고객명',
      dataIndex: 'customerName',
      render: (r) => (r.customerName as string | null) ?? '-',
      width: 100,
    },
    {
      title: '전화번호',
      dataIndex: 'phone',
      render: (r) => (r.phone ? <PhoneCell value={r.phone as string} link={false} /> : '-'),
      width: 140,
    },
    {
      title: '담당자',
      dataIndex: 'ownerName',
      render: (r) =>
        r.ownerName ? (
          <span className={styles.agentChip}>
            <UserRound size={12} />
            {r.ownerName as string}
          </span>
        ) : (
          <span className={styles.callState}>-</span>
        ),
      width: 112,
      mask: false,
    },
    { title: '담당 지점', dataIndex: 'orgName', width: 120 },
    { title: '제휴·전속', dataIndex: 'partnerName', width: 120 },
    { title: '메모', dataIndex: 'memo', flex: 1, minWidth: 140 },
    {
      title: '접수',
      dataIndex: 'leadNo',
      // 누르면 그 접수 상세로(행 클릭 = 통화 창과 따로)
      render: (r) => (
        <button
          type="button"
          className={styles.leadLink}
          title="접수 상세 열기"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/leads/${r.leadId as string}`);
          }}
        >
          <FileText size={13} />
          {r.leadNo as string}
        </button>
      ),
      width: 150,
      mask: false,
    },
    {
      title: '상태',
      dataIndex: 'result',
      render: (r) => {
        const x = r as unknown as FollowupRow;
        const cls = x.result === 'DONE' ? styles.st_DONE : x.result ? styles.st_OPEN : '';
        return (
          <span className={`${styles.stChip} ${cls}`}>
            {x.result ? RESULT[x.result] : '대기'}
            {x.tries > 1 ? ` ${x.tries}회` : ''}
          </span>
        );
      },
      width: 100,
      mask: false,
    },
  ];

  const L = LABEL[kind];
  return (
    <>
      <DataTable
        viewSwitch={viewSwitch}
        tabs={
          <span className={styles.fuDate}>
            <b>
              {L.when} · {L.title}
            </b>
            <span className={styles.muted}>이사일</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="이사일"
            />
          </span>
        }
        fit
        pageSize={20}
        columns={columns}
        rows={rows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => {
          setOpen(r as unknown as FollowupRow);
          setMemo((r.memo as string | null) ?? '');
        }}
        exportable
        exportFileName={L.title}
      />
      <Modal
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${L.title} — ${open.customerName ?? '고객'}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              닫기
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void save('NO_ANSWER')}>
              <PhoneOff size={14} /> 부재
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void save('DONE')}>
              <Check size={14} /> 통화 완료
            </Button>
          </>
        }
      >
        {open && (
          <div className={styles.fuModal}>
            <dl className={styles.fuInfo}>
              <dt>전화번호</dt>
              <dd>
                <b>{open.phone ? formatPhone(open.phone) : '-'}</b>
                {open.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!phone.call}
                    onClick={() => void call(open)}
                  >
                    <Phone size={14} />{' '}
                    {phone.status === 'ready' ? '전화 걸기' : 'PC 전화 켜고 걸기'}
                  </Button>
                )}
              </dd>
              <dt>이사일</dt>
              <dd>{open.moveDate}</dd>
              <dt>담당</dt>
              <dd>{[open.orgName, open.ownerName].filter(Boolean).join(' · ') || '-'}</dd>
              <dt>접수</dt>
              <dd>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => navigate(`/leads/${open.leadId}`)}
                >
                  {open.leadNo}
                </button>
                {open.partnerName && ` · ${open.partnerName}`}
              </dd>
              {open.at && (
                <>
                  <dt>지난 통화</dt>
                  <dd>
                    {open.result ? RESULT[open.result] : ''} ·{' '}
                    {new Date(open.at).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {open.by && ` · ${open.by}`} ({open.tries}번)
                  </dd>
                </>
              )}
            </dl>
            <p className={styles.fuGuide}>{L.guide}</p>
            <label className={styles.field}>
              <span>통화 메모</span>
              <Textarea
                rows={4}
                value={memo}
                placeholder={
                  kind === 'CONFIRM'
                    ? '예: 시간 변동 없음, 엘리베이터 사용 예약 완료'
                    : '예: 만족, 식탁 다리 긁힘 → 지점 전달'
                }
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
