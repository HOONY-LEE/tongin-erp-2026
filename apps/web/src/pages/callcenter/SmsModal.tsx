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
        toast({ type: 'success', title: `${formatPhone(to)}로 문자를 보냈습니다` });
      else if (r.ok)
        toast({
          type: 'info',
          title: `기록했습니다 — ${r.reason ?? '실제로는 나가지 않았습니다'}`,
        });
      else toast({ type: 'error', title: `보내지 못했습니다 — ${r.reason ?? ''}` });
      if (r.ok) onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '보내지 못했습니다' });
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
      toast({ type: 'success', title: '템플릿으로 저장했습니다' });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    }
  };
  const removeTemplate = async (t: Template) => {
    try {
      await api(`/cs-sms/templates/${t.id}`, { method: 'DELETE' });
      if (picked === t.id) setPicked(null);
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title="문자 보내기"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            <Button
              variant="primary"
              disabled={busy || !body.trim() || tooLong || to.replace(/\D/g, '').length < 9}
              onClick={() => void send()}
            >
              <Send size={14} /> 보내기
            </Button>
          </>
        }
      >
        <div className={`${styles.wrap} sms-modal-wrap`}>
          <div className={styles.left}>
            <div className={styles.section}>
              <span className={styles.label}>템플릿</span>
              <div className={styles.chips}>
                {templates.map((t) => (
                  <span key={t.id} className={styles.chipWrap}>
                    <button
                      type="button"
                      className={[
                        styles.chip,
                        t.shared && styles.chipShared,
                        picked === t.id && styles.chipOn,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={t.shared ? '공유 템플릿' : '내 템플릿'}
                      onClick={() => pick(t)}
                    >
                      {t.shared && <Users size={11} />}
                      {t.title}
                    </button>
                    {(!t.shared || t.employeeId === user?.employeeId) && (
                      <button
                        type="button"
                        className={styles.chipDel}
                        aria-label={`${t.title} 템플릿 지우기`}
                        onClick={() => void removeTemplate(t)}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <label className={styles.section}>
              <span className={styles.label}>받는 번호</span>
              <Input value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            {lms && (
              <label className={styles.section}>
                <span className={styles.label}>제목(장문)</span>
                <Input
                  value={title}
                  maxLength={40}
                  placeholder="예: 통인익스프레스 상담 안내"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            <label className={`${styles.section} ${styles.grow}`}>
              <span className={styles.label}>
                내용
                <span className={`${styles.count} ${tooLong ? styles.over : ''}`}>
                  {lms ? `장문(LMS) ${body.length}/2,000자` : `단문(SMS) ${size}/90 byte`}
                </span>
              </span>
              <Textarea
                className={styles.text}
                value={body}
                placeholder="템플릿을 고르거나 직접 적어 주세요. 90byte(한글 45자)를 넘으면 장문으로 보냅니다."
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
                <Save size={13} /> 템플릿으로 저장
              </Button>
              <span className={styles.note}>
                {status?.vendor
                  ? `${status.vendor}로 보냅니다${
                      status.restricted ? ' · 지금은 허용 번호(직원·시연)로만 실제 발송' : ''
                    }`
                  : '문자 발송사가 연결되지 않아 기록만 남습니다'}
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
              placeholder="보낼 내용이 여기 미리 보입니다"
              width={300}
            />
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={saveOpen}
        title="템플릿으로 저장"
        confirmLabel="저장"
        onClose={() => setSaveOpen(false)}
        onConfirm={() => saveTitle.trim() && void saveTemplate()}
      >
        <div className={styles.saveForm}>
          <Input
            value={saveTitle}
            maxLength={40}
            placeholder="템플릿 이름 — 예: 견적 일정 확인"
            onChange={(e) => setSaveTitle(e.target.value)}
          />
          <SegmentedControl
            value={saveShared}
            onChange={(v) => setSaveShared(v as 'mine' | 'shared')}
            options={[
              { value: 'mine', label: '개인' },
              { value: 'shared', label: '공유' },
            ]}
          />
        </div>
      </ConfirmModal>
    </>
  );
}
