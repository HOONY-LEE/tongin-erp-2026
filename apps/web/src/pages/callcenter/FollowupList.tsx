import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { fmtDateTime } from '../../lib/dateFormat';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Check, FileText, UserRound } from 'lucide-react';
import { Phone as PhoneCell } from 'softium-ui/table';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { dial, enablePhone, getPhoneState, usePhone } from '../../lib/softphone';
import {
  Button,
  DataTable,
  FilterButton,
  filterRows,
  Modal,
  Textarea,
  useToast,
  type Column,
  type FilterField,
  type DateRange,
  type FilterValues,
  type Row,
} from '../../components/ui';
import styles from '../callcenter.module.css';
import { DialButton } from './DialButton';

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
const LABEL: Record<FollowupKind, { title: string; guide: string }> = {
  CONFIRM: {
    title: i18n.t('cc.fu.CONFIRM'),
    guide:
      '안녕하세요, 통인익스프레스입니다. ○○일 이사 예정이셔서 확인차 연락드렸습니다. 이사 시간·주소·짐 변동 사항 있으실까요?',
  },
  HAPPY: {
    title: i18n.t('cc.fu.HAPPY'),
    guide:
      '안녕하세요, 통인익스프레스입니다. 어제 이사는 잘 마치셨을까요? 작업 중 불편하셨던 점이나 파손·분실된 물건은 없으신지 여쭤보려고 연락드렸습니다.',
  },
};
const RESULT: Record<string, string> = {
  DONE: i18n.t('cc.fu.done'),
  NO_ANSWER: i18n.t('cc.fu.absent'),
};

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
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const phone = usePhone();
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<FollowupRow | null>(null);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [flt, setFlt] = useState<FilterValues>({});

  // 이사일 — 필터의 '기간'. 처음엔 서버 기본(확인콜 2일 뒤 · 해피콜 어제) 하루를 채워 보여 준다
  const range = flt.period as DateRange | undefined;
  const from = range?.from ?? '';
  const to = range?.to ?? '';
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ kind });
      if (from) qs.set('date', from);
      if (to) qs.set('to', to);
      const r = await api<{ date: string; to: string; rows: FollowupRow[] }>(`/cs-followups?${qs}`);
      setRows(r.rows);
      if (!from) setFlt((f) => ({ ...f, period: { from: r.date, to: r.to } }));
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('cc.listFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [kind, from, to, toast]);
  useEffect(() => {
    void load();
  }, [load]);

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
      toast({ type: 'success', title: t('cc.fu.saved', { v0: RESULT[result] }) });
      setOpen(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column[] = [
    {
      title: t('cc.moveDate'),
      dataIndex: 'moveDate',
      width: 110,
    },
    {
      title: t('cc.customerName'),
      dataIndex: 'customerName',
      render: (r) => (r.customerName as string | null) ?? '-',
      width: 100,
    },
    {
      title: t('cc.phone'),
      dataIndex: 'phone',
      render: (r) => (r.phone ? <PhoneCell value={r.phone as string} link={false} /> : '-'),
      width: 140,
    },
    {
      title: t('cc.owner'),
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
    { title: t('cc.ownerBranch'), dataIndex: 'orgName', width: 120 },
    { title: t('cc.partner'), dataIndex: 'partnerName', width: 120 },
    { title: t('cc.memoShort'), dataIndex: 'memo', flex: 1, minWidth: 140 },
    {
      title: t('cc.lead'),
      dataIndex: 'leadNo',
      // 누르면 그 접수 상세로(행 클릭 = 통화 창과 따로)
      render: (r) => (
        <button
          type="button"
          className={styles.leadLink}
          title={t('cc.openLeadDetail')}
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
      title: t('cc.status'),
      dataIndex: 'result',
      render: (r) => {
        const x = r as unknown as FollowupRow;
        const cls = x.result === 'DONE' ? styles.st_DONE : x.result ? styles.st_OPEN : '';
        return (
          <span className={`${styles.stChip} ${cls}`}>
            {x.result ? RESULT[x.result] : t('cc.waiting')}
            {x.tries > 1 ? t('cc.triesN', { v0: x.tries }) : ''}
          </span>
        );
      },
      width: 100,
      mask: false,
    },
  ];

  const distinct = (k: 'orgName' | 'ownerName') =>
    [...new Set(rows.map((r) => r[k]).filter((x): x is string => !!x))]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((x) => ({ value: x, label: x }));
  const branches = distinct('orgName');
  const owners = distinct('ownerName');
  const filterFields: FilterField[] = [
    { key: 'period', label: t('cc.moveDate'), type: 'date' },
    {
      key: 'result',
      label: t('cc.status'),
      type: 'multi',
      options: [
        { value: 'WAITING', label: t('cc.waiting') },
        { value: 'DONE', label: RESULT.DONE },
        { value: 'NO_ANSWER', label: RESULT.NO_ANSWER },
      ],
    },
    ...(branches.length > 1
      ? [
          {
            key: 'orgName',
            label: t('cc.ownerBranch'),
            type: 'multi',
            options: branches,
          } as FilterField,
        ]
      : []),
    ...(owners.length > 1
      ? [{ key: 'ownerName', label: t('cc.owner'), type: 'multi', options: owners } as FilterField]
      : []),
  ];
  // 기간은 서버에서 — 화면에서는 나머지 조건만
  const shown = filterRows(
    rows,
    filterFields.filter((f) => f.key !== 'period'),
    flt,
    (r, key) => (key === 'result' ? (r.result ?? 'WAITING') : r[key as 'orgName' | 'ownerName']),
  );
  const L = LABEL[kind];
  return (
    <>
      {viewSwitch && <div className={styles.listHead}>{viewSwitch}</div>}
      <DataTable
        filters={<FilterButton fields={filterFields} value={flt} onChange={setFlt} />}
        fit
        pageSize={20}
        columns={columns}
        rows={shown as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => {
          setOpen(r as unknown as FollowupRow);
          setMemo((r.memo as string | null) ?? '');
        }}
        exportable
        exportFileName={L.title}
        exportCompact
        toolbarActions={<DialButton />}
      />
      <Modal
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${L.title} — ${open.customerName ?? t('cc.customer')}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              {t('cc.close')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void save('NO_ANSWER')}>
              <PhoneOff size={14} /> {t('cc.fu.absent')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void save('DONE')}>
              <Check size={14} /> {t('cc.fu.done')}
            </Button>
          </>
        }
      >
        {open && (
          <div className={styles.fuModal}>
            <dl className={styles.fuInfo}>
              <dt>{t('cc.phone')}</dt>
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
                    {phone.status === 'ready' ? t('cc.dialBtn') : t('cc.enableAndDial')}
                  </Button>
                )}
              </dd>
              <dt>{t('cc.moveDate')}</dt>
              <dd>{open.moveDate}</dd>
              <dt>{t('cc.h.owner')}</dt>
              <dd>{[open.orgName, open.ownerName].filter(Boolean).join(' · ') || '-'}</dd>
              <dt>{t('cc.lead')}</dt>
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
                  <dt>{t('cc.pastCalls')}</dt>
                  <dd>
                    {open.result ? RESULT[open.result] : ''} · {fmtDateTime(open.at)}
                    {open.by && ` · ${open.by}`} ({open.tries}
                    {t('cc.timesClose')}
                  </dd>
                </>
              )}
            </dl>
            <p className={styles.fuGuide}>{L.guide}</p>
            <label className={styles.field}>
              <span>{t('cc.callMemo')}</span>
              <Textarea
                rows={4}
                value={memo}
                placeholder={kind === 'CONFIRM' ? t('cc.fu.confirmPh') : t('cc.fu.happyPh')}
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
