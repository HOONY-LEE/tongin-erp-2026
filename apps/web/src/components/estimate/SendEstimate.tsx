import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { Button, Modal, Spinner, useToast } from '../ui';
import type { EstimateDetailData } from './types';
import styles from './estimate.module.css';

interface Preview {
  to: string | null;
  totalAmount: number;
  depositAmount: number;
  contractStatus: string | null;
  sentAt: string | null;
  paymentMode: { provider: 'TOSS' | 'MANUAL'; autoConfirm: boolean };
  smsVendor: string | null;
  problems: string[];
}
interface SendResult {
  ok: boolean;
  delivered: boolean;
  reason: string | null;
  to: string | null;
  link: string;
  account: string | null;
  message: string;
}

const won = (v: number) => `${Math.round(v).toLocaleString()}원`;

/**
 * 고객에게 견적서 보내기 — 문자 한 통에 견적서·서명 링크와 계약금 계좌를 담아 보낸다.
 * 보내면 입금확인 목록에 '입금 대기'로 올라가고, 고객이 서명·입금하면 상태가 저절로 바뀐다.
 */
export function SendEstimateModal({
  open,
  onClose,
  data,
  dirty,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  data: EstimateDetailData;
  dirty: boolean;
  onSent: () => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setResult(null);
    setCopied(false);
    api<Preview>(`/estimates/${data.id}/send`)
      .then(setPreview)
      .catch((e) =>
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' }),
      );
  }, [open, data.id, toast]);

  const send = async () => {
    setSending(true);
    try {
      const r = await api<SendResult>(`/estimates/${data.id}/send`, { method: 'POST' });
      setResult(r);
      onSent();
      toast(
        r.ok
          ? { type: 'success', title: '견적서를 보냈습니다' }
          : { type: 'warning', title: `문자는 보내지 못했습니다 — ${r.reason ?? ''}` },
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '보내지 못했습니다' });
    } finally {
      setSending(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* 클립보드 권한이 없으면 무시 */
    }
  };

  const signed = preview?.contractStatus === 'SIGNED';

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="고객에게 견적서 보내기"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            닫기
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={() => void send()}
              loading={sending}
              disabled={!preview || preview.problems.length > 0}
            >
              {preview?.sentAt ? '다시 보내기' : '보내기'}
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : result ? (
        <div className={styles.sendBox}>
          <div className={styles.sendRow}>
            <span>받는 사람</span>
            <b>
              {data.meta.customerName} · {result.to ? formatPhone(result.to) : '-'}
            </b>
          </div>
          <div className={styles.sendRow}>
            <span>문자</span>
            <b>
              {result.ok
                ? result.delivered
                  ? '발송 완료'
                  : '발송 처리(시연 — 실제 문자는 나가지 않음)'
                : `발송 안 됨 — ${result.reason ?? ''}`}
            </b>
          </div>
          <div className={styles.sendRow}>
            <span>서명 링크</span>
            <span className={styles.sendLink}>
              <a href={result.link} target="_blank" rel="noreferrer">
                {result.link}
              </a>
              <Button
                variant="ghost"
                size="sm"
                aria-label="링크 복사"
                onClick={() => void copy(result.link)}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </span>
          </div>
          <pre className={styles.sendMsg}>{result.message}</pre>
        </div>
      ) : (
        <div className={styles.sendBox}>
          {dirty && (
            <div className={styles.sendWarn}>
              저장하지 않은 변경이 있습니다. 저장한 내용으로 보내집니다.
            </div>
          )}
          {preview.problems.map((p) => (
            <div key={p} className={styles.sendWarn}>
              {p}
            </div>
          ))}
          <div className={styles.sendRow}>
            <span>받는 사람</span>
            <b>
              {data.meta.customerName} · {preview.to ? formatPhone(preview.to) : '연락처 없음'}
            </b>
          </div>
          <div className={styles.sendRow}>
            <span>총 비용</span>
            <b>{won(preview.totalAmount)}</b>
          </div>
          <div className={styles.sendRow}>
            <span>계약금</span>
            <b>{won(preview.depositAmount)}</b>
          </div>
          <ul className={styles.sendList}>
            <li>문자에 견적서 확인·전자서명 링크와 계약금 입금 계좌가 함께 갑니다.</li>
            <li>고객은 링크에서 견적서를 보고, PDF로 저장하고, 바로 서명할 수 있습니다.</li>
            <li>
              {preview.paymentMode.autoConfirm
                ? '계약금 계좌는 고객 전용 가상계좌로 발급되어, 입금하면 입금확인에 자동으로 반영됩니다.'
                : '계약금 계좌는 회사 계좌로 안내됩니다. 입금확인 화면에서 확인(또는 시연용 입금 시뮬레이션)하면 반영됩니다.'}
            </li>
            {signed && <li>이미 고객이 서명했습니다 — 다시 보내도 금액은 바뀌지 않습니다.</li>}
            {!preview.smsVendor && <li>문자 발송사가 연결되지 않아 시연 모드로 처리됩니다.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
