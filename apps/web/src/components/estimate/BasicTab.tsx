import { useEffect, useMemo, useState } from 'react';
import { LEAD_STATUS_LABEL } from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { useAuth } from '../../auth/AuthContext';
import { Input, Select, useToast } from '../ui';
import { AddressField } from '../ui/AddressField';
import { ADDRESS_PARTS, addrKey } from '../ui/address';
import { SaveBar } from './parts';
import { DistanceCard } from './DistanceCard';
import { useTabForm } from './useTabForm';
import type { EstimateDetailData, TabProps } from './types';
import styles from './estimate.module.css';

interface ProductRow {
  id: string;
  name: string;
  serviceLine: string;
  isActive?: boolean;
}

interface BasicForm {
  customerName: string;
  customerPhone: string;
  productId: string;
  visitDate: string;
  moveDate: string;
  /** 주소 — AddressField 키(fromZipcode, toAddr …) 그대로 */
  addr: Record<string, string>;
}

const derive = (d: EstimateDetailData): BasicForm => {
  const addr: Record<string, string> = {};
  for (const prefix of ['from', 'to'] as const) {
    for (const part of ADDRESS_PARTS) {
      const k = addrKey(prefix, part);
      const v = d[k as keyof EstimateDetailData];
      addr[k] = v == null ? '' : String(v);
    }
  }
  return {
    customerName: d.meta.customerName ?? '',
    customerPhone: d.meta.customerPhone ?? '',
    productId: d.productId,
    visitDate: d.lead?.visitDate ?? '',
    moveDate: d.lead?.moveDate ?? '',
    addr,
  };
};

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoValue}>{value || '-'}</div>
    </div>
  );
}

/** 1. 기본정보 — 견적서 머리 정보. 회색 칸은 다른 단계에서 정해지는 값이라 읽기만 한다. */
export function BasicTab({ data, canEdit, onSaved, onDirtyChange }: TabProps) {
  const toast = useToast();
  const { can } = useAuth();
  const { form, setForm, dirty, reset, accept } = useTabForm(data, derive, onDirtyChange);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);

  // 고객 이름·연락처는 고객 원장이라 고객 수정 권한이 있어야 고칠 수 있다
  const canEditCustomer = canEdit && can('CUSTOMER.UPDATE');

  useEffect(() => {
    api<ProductRow[]>('/products')
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);
  // 이사종류는 같은 서비스라인(이사/리빙/케어…) 안에서만 바꾼다
  const productOptions = useMemo(
    () =>
      products
        .filter((p) => !data.serviceLine || p.serviceLine === data.serviceLine)
        // '사용 안 함' 상품은 고를 수 없게 — 이미 이 견적에 걸린 상품은 그대로 보인다
        .filter((p) => p.isActive !== false || p.id === data.productId)
        .map((p) => ({ value: p.id, label: p.name })),
    [products, data.serviceLine, data.productId],
  );

  const set = <K extends keyof BasicForm>(k: K, v: BasicForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (k: string, v: string) => setForm((f) => ({ ...f, addr: { ...f.addr, [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      const base = derive(data);
      if (
        canEditCustomer &&
        (form.customerName !== base.customerName || form.customerPhone !== base.customerPhone)
      ) {
        if (!form.customerName.trim()) throw new Error('고객명을 입력하세요.');
        await api(`/customers/${data.customerId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.customerName.trim(),
            phonePrimary: form.customerPhone || undefined,
          }),
        });
      }
      const address: Record<string, string | number | undefined> = {};
      for (const [k, v] of Object.entries(form.addr)) {
        if (v === '') continue;
        address[k] = k.endsWith('Lat') || k.endsWith('Lng') ? Number(v) : v;
      }
      const next = await api<EstimateDetailData>(`/estimates/${data.id}/basic`, {
        method: 'PUT',
        body: JSON.stringify({
          productId: form.productId,
          ...address,
          // 비우면 날짜를 지운다('' → 서버에서 null)
          visitDate: form.visitDate,
          moveDate: form.moveDate,
        }),
      });
      accept(next);
      onSaved(next);
      toast({ type: 'success', title: '기본정보를 저장했습니다' });
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError || e instanceof Error ? e.message : '저장하지 못했습니다',
      });
    } finally {
      setSaving(false);
    }
  };

  const m = data.meta;
  return (
    <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.infoBox}>
        <Info label="계약번호" value={m.contractNo ?? '계약 전'} />
        <Info label="계약담당자" value={m.estimatorName} />
        <Info label="담당자연락처" value={m.estimatorPhone} />
        <Info label="지점명" value={m.orgUnitName} />
      </div>

      <div className={styles.row2}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>고객명</span>
          <Input
            value={form.customerName}
            onChange={(e) => set('customerName', e.target.value)}
            disabled={!canEditCustomer}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>전화번호</span>
          <Input
            value={form.customerPhone}
            onChange={(e) => set('customerPhone', formatPhone(e.target.value))}
            placeholder="010-0000-0000"
            disabled={!canEditCustomer}
          />
        </label>
      </div>
      {canEdit && !canEditCustomer && (
        <div className={styles.sub} style={{ marginTop: -8 }}>
          고객명·전화번호는 고객관리 권한이 있어야 고칠 수 있습니다.
        </div>
      )}

      <div className={styles.row2}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>이사 종류</span>
          <Select
            value={form.productId}
            onValueChange={(v) => set('productId', v)}
            options={productOptions}
            disabled={!canEdit}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>진행상태</span>
          {/* 진행상태는 견적 확정·계약 전환 같은 실제 처리로만 바뀐다(임의로 고르면 흐름이 꼬인다) */}
          <Input value={m.leadStatus ? LEAD_STATUS_LABEL[m.leadStatus] : '-'} disabled readOnly />
        </div>
      </div>

      <div className={styles.divider} />

      <AddressField
        addrPrefix="from"
        label="전 주소"
        values={form.addr}
        setField={canEdit ? setAddr : () => undefined}
      />
      <AddressField
        addrPrefix="to"
        label="후 주소"
        values={form.addr}
        setField={canEdit ? setAddr : () => undefined}
      />

      {/* 저장된 주소 기준 거리 — 주소를 바꾸면 저장할 때 다시 잰다 */}
      <DistanceCard
        data={data}
        onRuleSaved={() =>
          void api<EstimateDetailData>(`/estimates/${data.id}`)
            .then(onSaved)
            .catch(() => undefined)
        }
      />

      <div className={styles.divider} />

      <div className={styles.row2}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>접수일</span>
          <Input value={m.receivedDate ?? '-'} disabled readOnly />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>상담일</span>
          <Input
            type="date"
            value={form.visitDate}
            onChange={(e) => set('visitDate', e.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>계약일</span>
          <Input value={m.contractDate ?? '계약 전'} disabled readOnly />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>이사일</span>
          <Input
            type="date"
            value={form.moveDate}
            onChange={(e) => set('moveDate', e.target.value)}
            disabled={!canEdit}
          />
        </label>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        canEdit={canEdit}
        onSave={save}
        onReset={reset}
        hint="주소·상담일·이사일은 접수에도 같이 반영됩니다."
      />
    </div>
  );
}
