import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, Input, Modal, Select, Textarea } from '@sunghoon_lee/akron-ui';
import { formatPhone } from '@tongin/shared';
import { api, ApiError, cachedApi } from '../../lib/api';
import { Button, SegmentedControl, useToast } from '../ui';
import styles from './AsIntakeModal.module.css';

export interface AsCustomer {
  /** 고객 — 없으면 phone(+이름)으로 찾거나 새로 만든다 */
  id?: string | null;
  name?: string | null;
  phone?: string | null;
}
interface Category {
  code: string;
  name: string;
  isActive?: boolean;
}
interface CustomerLead {
  id: string;
  leadNo: string;
  moveDate: string | null;
  orgName: string | null;
}

const PRIORITIES = [
  { value: 'LOW', key: 'support.low' },
  { value: 'NORMAL', key: 'support.normal' },
  { value: 'HIGH', key: 'support.high' },
] as const;

/** 고객 고르기(고객/AS 화면) — 이름·전화로 찾는다 */
function CustomerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let alive = true;
    cachedApi<{ id: string; name: string; phonePrimary?: string | null }[]>('/customers')
      .then(
        (rows) =>
          alive &&
          setOpts(
            rows.map((c) => ({
              value: c.id,
              label: c.phonePrimary ? `${c.name} · ${formatPhone(c.phonePrimary)}` : c.name,
            })),
          ),
      )
      .catch(() => alive && setOpts([]));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Combobox
      value={value || null}
      onChange={(v) => onChange(v ?? '')}
      options={opts}
      placeholder={t('asx.customerPh')}
      searchPlaceholder={t('ui.find')}
      emptyMessage={t('ui.noMatch')}
      clearable
    />
  );
}

/**
 * A/S 접수 창 — 상담 화면(그 콜의 고객)과 고객/AS 화면(고객을 고른다)이 같이 쓴다.
 * 반드시 고객에 잇고(전화번호·이름·이력), 제목·내용은 꼭 적는다. 담당 지점은 받지 않는다 —
 * 관련 접수(견적건)·고객의 지점을 따른다. 우선순위 기본은 보통.
 */
export function AsIntakeModal({
  open,
  onClose,
  customer,
  channel,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** 정해진 고객(상담 화면) — 없으면 창에서 고른다 */
  customer?: AsCustomer;
  channel?: 'PHONE' | 'EMAIL' | 'KAKAO' | 'VISIT';
  onCreated?: (t: { id: string; ticketNo: string }) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fixed = !!customer;
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<string>('NORMAL');
  const [leads, setLeads] = useState<CustomerLead[]>([]);
  const [leadId, setLeadId] = useState('');
  const [busy, setBusy] = useState(false);

  // 열 때마다 비운다
  useEffect(() => {
    if (!open) return;
    setCustomerId(customer?.id ?? '');
    setName(customer?.name ?? '');
    setSubject('');
    setContent('');
    setPriority('NORMAL');
    setLeadId('');
    api<Category[]>('/support-tickets/categories')
      .then((all) => {
        const c = all.filter((x) => x.isActive !== false);
        setCategories(c);
        setCategory(c[0]?.code ?? '');
      })
      .catch(() => toast({ type: 'error', title: t('asx.loadFailed') }));
  }, [open, customer?.id, customer?.name, toast, t]);

  // 고객의 접수(견적건) — 관련 접수로 고른다
  useEffect(() => {
    setLeads([]);
    setLeadId('');
    if (!open || !customerId) return;
    let alive = true;
    api<CustomerLead[]>(`/support-tickets/customer-leads?customerId=${customerId}`)
      .then((r) => alive && setLeads(r))
      .catch(() => alive && setLeads([]));
    return () => {
      alive = false;
    };
  }, [open, customerId]);

  const newCustomer = fixed && !customer?.id;
  const ready =
    !!category &&
    !!subject.trim() &&
    !!content.trim() &&
    (customerId || (newCustomer && name.trim() && customer?.phone));

  const save = async () => {
    if (!ready) {
      toast({ type: 'error', title: t('asx.need') });
      return;
    }
    setBusy(true);
    try {
      const created = await api<{ id: string; ticketNo: string }>('/support-tickets', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'AS',
          category,
          subject: subject.trim(),
          content: content.trim(),
          priority,
          ...(customerId
            ? { customerId }
            : { customerName: name.trim(), customerPhone: customer?.phone ?? '' }),
          ...(leadId && { leadId }),
          ...(channel && { channel }),
        }),
      });
      toast({ type: 'success', title: t('asx.created', { v0: ` (${created.ticketNo})` }) });
      onCreated?.(created);
      onClose();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('asx.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('asx.title')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !ready}>
            {t('asx.save')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {/* 고객 — 상담 화면은 그 콜의 고객, 고객/AS 화면은 고른다 */}
        <label className={styles.field}>
          <span className={styles.label}>
            {t('asx.customer')} <i>*</i>
          </span>
          {fixed ? (
            customer?.id ? (
              <span className={styles.customer}>
                <b>{customer.name ?? '-'}</b>
                {customer.phone && <span>{formatPhone(customer.phone)}</span>}
              </span>
            ) : (
              <span className={styles.customerNew}>
                <Input
                  value={name}
                  placeholder={t('asx.customerName')}
                  onChange={(e) => setName(e.target.value)}
                  aria-label={t('asx.customerName')}
                />
                <span>{customer?.phone ? formatPhone(customer.phone) : ''}</span>
                <small>{t('asx.newCustomer')}</small>
              </span>
            )
          ) : (
            <CustomerPicker value={customerId} onChange={setCustomerId} />
          )}
        </label>

        <div className={styles.pair}>
          <label className={styles.field}>
            <span className={styles.label}>
              {t('asx.category')} <i>*</i>
            </span>
            <Select
              value={category}
              onValueChange={setCategory}
              options={categories.map((c) => ({ value: c.code, label: c.name }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('asx.lead')}</span>
            <Select
              value={leadId || '__none'}
              onValueChange={(v) => setLeadId(v === '__none' ? '' : v)}
              disabled={!leads.length}
              options={[
                { value: '__none', label: t('asx.leadNone') },
                ...leads.map((l) => ({
                  value: l.id,
                  label: [l.leadNo, l.moveDate, l.orgName].filter(Boolean).join(' · '),
                })),
              ]}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>
            {t('asx.subject')} <i>*</i>
          </span>
          <Input
            value={subject}
            maxLength={200}
            placeholder={t('asx.subjectPh')}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>
            {t('asx.content')} <i>*</i>
          </span>
          <Textarea
            value={content}
            rows={5}
            maxLength={4000}
            placeholder={t('asx.contentPh')}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>{t('asx.priority')}</span>
          <SegmentedControl
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({ value: p.value, label: t(p.key) }))}
          />
        </div>
      </div>
    </Modal>
  );
}
