import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
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

const won = (v: number) => i18n.t('est.won', { v0: Math.round(v).toLocaleString() });

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
  const { t } = useTranslation();
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
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('est.loadFailed') }),
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
          ? { type: 'success', title: t('est.sent') }
          : { type: 'warning', title: t('est.smsFailed', { v0: r.reason ?? '' }) },
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('est.sendFailed') });
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
      title={t('est.send')}
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            {t('est.close')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('est.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void send()}
              loading={sending}
              disabled={!preview || preview.problems.length > 0}
            >
              {preview?.sentAt ? t('est.resendBtn') : t('est.sendBtn')}
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
            <span>{t('est.to2')}</span>
            <b>
              {data.meta.customerName} · {result.to ? formatPhone(result.to) : '-'}
            </b>
          </div>
          <div className={styles.sendRow}>
            <span>{t('est.sms')}</span>
            <b>
              {result.ok
                ? result.delivered
                  ? t('est.smsSent')
                  : t('est.smsDemo')
                : t('est.smsNot', { v0: result.reason ?? '' })}
            </b>
          </div>
          <div className={styles.sendRow}>
            <span>{t('est.signLink')}</span>
            <span className={styles.sendLink}>
              <a href={result.link} target="_blank" rel="noreferrer">
                {result.link}
              </a>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('est.copyLink')}
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
          {dirty && <div className={styles.sendWarn}>{t('est.unsavedSend')}</div>}
          {preview.problems.map((p) => (
            <div key={p} className={styles.sendWarn}>
              {p}
            </div>
          ))}
          <div className={styles.sendRow}>
            <span>{t('est.to2')}</span>
            <b>
              {data.meta.customerName} · {preview.to ? formatPhone(preview.to) : t('est.noPhone')}
            </b>
          </div>
          <div className={styles.sendRow}>
            <span>{t('est.totalCost')}</span>
            <b>{won(preview.totalAmount)}</b>
          </div>
          <div className={styles.sendRow}>
            <span>{t('est.deposit')}</span>
            <b>{won(preview.depositAmount)}</b>
          </div>
          <ul className={styles.sendList}>
            <li>{t('est.sendNote1')}</li>
            <li>{t('est.sendNote2')}</li>
            <li>{preview.paymentMode.autoConfirm ? t('est.sendNote3a') : t('est.sendNote3b')}</li>
            {signed && <li>{t('est.sendNoteSigned')}</li>}
            {!preview.smsVendor && <li>{t('est.sendNoteDemo')}</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
