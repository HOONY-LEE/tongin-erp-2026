import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Save, Send, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { useAuth } from '../../auth/AuthContext';
import { PhonePreview } from '../../components/PhonePreview';
import {
  Button,
  ConfirmModal,
  Input,
  Modal,
  SegmentedControl,
  Textarea,
  useToast,
} from '../../components/ui';
import styles from './smsModal.module.css';

interface Template {
  id: string;
  title: string;
  body: string;
  shared: boolean;
  employeeId: string | null;
}
interface SmsStatus {
  vendor: string | null;
  sender: string | null;
  live: boolean;
  restricted: boolean;
}

/** 문자 길이(EUC-KR) — 영문·숫자 1, 한글 2. 90 넘으면 장문(LMS) */
const bytes = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 2), 0);
const md = (d?: string | null) =>
  d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : '이사일';

/**
 * 상담 콘솔 문자 보내기 — 왼쪽에 템플릿·받는 번호·내용, 오른쪽에 고객 휴대폰(아이폰) 미리보기.
 * {고객명} {접수번호} {이사일} {상담원}은 이 고객 값으로 바꿔 보낸다.
 */
export function SmsModal({
  open,
  onClose,
  phone,
  customerName,
  leadNo,
  moveDate,
  callId,
}: {
  open: boolean;
  onClose: () => void;
  phone: string;
  customerName?: string | null;
  leadNo?: string | null;
  moveDate?: string | null;
  callId?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [to, setTo] = useState(phone);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveShared, setSaveShared] = useState<'mine' | 'shared'>('mine');

  const load = () =>
    api<Template[]>('/cs-sms/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  useEffect(() => {
    if (!open) return;
    setTo(phone);
    setTitle('');
    setBody('');
    setPicked(null);
    void load();
    void api<SmsStatus>('/cs-sms/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open, phone]);

  const fill = (text: string) =>
    text
      .replaceAll('{고객명}', customerName || '고객')
      .replaceAll('{접수번호}', leadNo || '-')
      .replaceAll('{이사일}', md(moveDate))
      .replaceAll('{상담원}', user?.employeeName ?? '상담원');
  const pick = (t: Template) => {
    setPicked(t.id);
    setBody(fill(t.body));
  };
  const size = bytes(body);
  const lms = size > 90;
  const tooLong = body.length > 2000;
  const preview = useMemo(() => body, [body]);

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; delivered: boolean; reason: string | null }>(
        '/cs-sms/send',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: to,
            body,
            ...(lms && title.trim() ? { title: title.trim() } : {}),
            ...(callId ? { callId } : {}),
          }),
        },
      );
      if (r.ok && r.delivered)
        toast({ type: 'success', title: t('cc.smsSent', { v0: formatPhone(to) }) });
      else if (r.ok)
        toast({
          type: 'info',
          title: t('cc.smsRecorded', { v0: r.reason ?? t('cc.smsNotSent') }),
        });
      else toast({ type: 'error', title: t('cc.smsFailedOf', { v0: r.reason ?? '' }) });
      if (r.ok) onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.smsFailed') });
    } finally {
      setBusy(false);
    }
  };
  const saveTemplate = async () => {
    try {
      await api('/cs-sms/templates', {
        method: 'POST',
        body: JSON.stringify({ title: saveTitle.trim(), body, shared: saveShared === 'shared' }),
      });
      setSaveOpen(false);
      setSaveTitle('');
      await load();
      toast({ type: 'success', title: t('cc.templateSaved') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.saveFailed') });
    }
  };
  const removeTemplate = async (tpl: Template) => {
    try {
      await api(`/cs-sms/templates/${tpl.id}`, { method: 'DELETE' });
      if (picked === tpl.id) setPicked(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('cc.deleteFailed') });
    }
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={t('cc.sendSms')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('cc.close')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || !body.trim() || tooLong || to.replace(/\D/g, '').length < 9}
              onClick={() => void send()}
            >
              <Send size={14} /> {t('cc.send')}
            </Button>
          </>
        }
      >
        <div className={`${styles.wrap} sms-modal-wrap`}>
          <div className={styles.left}>
            <div className={styles.section}>
              <span className={styles.label}>{t('cc.templates')}</span>
              <div className={styles.chips}>
                {templates.map((tpl) => (
                  <span key={tpl.id} className={styles.chipWrap}>
                    <button
                      type="button"
                      className={[
                        styles.chip,
                        tpl.shared && styles.chipShared,
                        picked === tpl.id && styles.chipOn,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={tpl.shared ? t('cc.sharedTemplates') : t('cc.myTemplates')}
                      onClick={() => pick(tpl)}
                    >
                      {tpl.shared && <Users size={11} />}
                      {tpl.title}
                    </button>
                    {(!tpl.shared || tpl.employeeId === user?.employeeId) && (
                      <button
                        type="button"
                        className={styles.chipDel}
                        aria-label={t('cc.deleteTemplateOf', { v0: tpl.title })}
                        onClick={() => void removeTemplate(tpl)}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <label className={styles.section}>
              <span className={styles.label}>{t('cc.to')}</span>
              <Input value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            {lms && (
              <label className={styles.section}>
                <span className={styles.label}>{t('cc.subject')}</span>
                <Input
                  value={title}
                  maxLength={40}
                  placeholder={t('cc.subjectPh')}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            <label className={`${styles.section} ${styles.grow}`}>
              <span className={styles.label}>
                {t('cc.content')}
                <span className={`${styles.count} ${tooLong ? styles.over : ''}`}>
                  {lms ? t('cc.lmsCount', { v0: body.length }) : t('cc.smsCount', { v0: size })}
                </span>
              </span>
              <Textarea
                className={styles.text}
                value={body}
                placeholder={t('cc.bodyPh')}
                onChange={(e) => {
                  setBody(e.target.value);
                  setPicked(null);
                }}
              />
            </label>
            <div className={styles.foot}>
              <Button
                variant="outline"
                size="sm"
                disabled={!body.trim()}
                onClick={() => setSaveOpen(true)}
              >
                <Save size={13} /> {t('cc.saveTemplate')}
              </Button>
              <span className={styles.note}>
                {status?.vendor
                  ? t('cc.sendVia', {
                      v0: status.vendor,
                      v1: status.restricted ? t('cc.restricted') : '',
                    })
                  : t('cc.noVendor')}
              </span>
            </div>
          </div>
          <div className={styles.right}>
            <PhonePreview
              channel="SMS"
              sender="통인익스프레스"
              senderNo={status?.sender ? formatPhone(status.sender) : '1899-0123'}
              lms={lms}
              title={title}
              body={preview}
              placeholder={t('cc.previewEmpty')}
              width={250}
            />
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={saveOpen}
        title={t('cc.saveTemplate')}
        confirmLabel={t('cc.save')}
        onClose={() => setSaveOpen(false)}
        onConfirm={() => saveTitle.trim() && void saveTemplate()}
      >
        <div className={styles.saveForm}>
          <Input
            value={saveTitle}
            maxLength={40}
            placeholder={t('cc.templateNamePh')}
            onChange={(e) => setSaveTitle(e.target.value)}
          />
          <SegmentedControl
            value={saveShared}
            onChange={(v) => setSaveShared(v as 'mine' | 'shared')}
            options={[
              { value: 'mine', label: t('cc.personal') },
              { value: 'shared', label: t('cc.shared') },
            ]}
          />
        </div>
      </ConfirmModal>
    </>
  );
}
