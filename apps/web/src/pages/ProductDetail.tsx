import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import {
  BUNDLE_ROLES,
  BUNDLE_ROLE_LABEL,
  PRICING_METHOD_LABEL,
  SERVICE_LINE_LABEL,
  type BundleRole,
  type PricingMethod,
  type ServiceLine,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  PageCard,
  PageHeader,
  Select,
  useToast,
  PageSkeleton,
} from '../components/ui';
import { UnitField } from '../components/estimate/parts';
import { fs } from '../lib/fontScale';

const won = (v: unknown) =>
  v != null && v !== '' ? i18n.t('prod.won', { v0: Number(v).toLocaleString() }) : '-';

interface Addon {
  id: string;
  name: string;
  kind: string;
  unit: string;
  price: string | number | null;
  isActive: boolean;
}
interface BundleEntry {
  addonServiceId: string;
  role: BundleRole;
  priceOverride: string | number | null;
  addon: Addon;
}
interface Product {
  id: string;
  code: string;
  name: string;
  category: string | null;
  serviceLine: string;
  pricingMethod: string;
  basePrice: string | number | null;
  isActive: boolean;
  addons: BundleEntry[];
}
interface Row {
  addonServiceId: string;
  role: BundleRole;
  price: string;
}

const toRows = (p: Product): Row[] =>
  p.addons.map((a) => ({
    addonServiceId: a.addonServiceId,
    role: a.role,
    price: a.priceOverride == null ? '' : String(Number(a.priceOverride)),
  }));

/**
 * 상품구성 상세 — 이 구성(가정이사 등)으로 견적할 때 3단계에 나올 상품과 역할.
 * 필수는 빠질 수 없고, 기본선택은 처음부터 체크되며, 선택은 고르면 들어간다.
 * 구성 단가를 비우면 상품의 기본가를 쓴다. 이사물량이면 CBM·톤당 단가다.
 */
export default function ProductDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [catalog, setCatalog] = useState<Addon[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [prod, addons] = await Promise.all([
        api<Product>(`/products/${id}`),
        api<Addon[]>('/addon-services'),
      ]);
      setProduct(prod);
      setRows(toRows(prod));
      setCatalog(addons);
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('prod.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [id, toast, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(catalog.map((a) => [a.id, a])), [catalog]);
  const dirty = !!product && JSON.stringify(toRows(product)) !== JSON.stringify(rows);
  const candidates = catalog.filter(
    (a) => a.isActive && !rows.some((r) => r.addonServiceId === a.id),
  );

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const n = [...rs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const add = (addonServiceId: string) => {
    const a = byId.get(addonServiceId);
    setRows((rs) => [
      ...rs,
      { addonServiceId, role: a?.kind === 'VOLUME' ? 'REQUIRED' : 'OPTIONAL', price: '' },
    ]);
  };

  const save = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const next = await api<Product>(`/products/${product.id}/items`, {
        method: 'PUT',
        body: JSON.stringify({
          items: rows.map((r) => ({
            addonServiceId: r.addonServiceId,
            role: r.role,
            priceOverride: r.price === '' ? null : Number(r.price),
          })),
        }),
      });
      setProduct(next);
      setRows(toRows(next));
      toast({ type: 'success', title: t('prod.bundleSaved') });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('prod.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !product) {
    return (
      <div style={{ padding: 4 }}>
        <PageSkeleton />
      </div>
    );
  }
  if (!product) return null;

  const cell = { padding: '8px 10px', verticalAlign: 'middle' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={product.name}
        subtitle={t('prod.bundleCode', { v0: product.code })}
        breadcrumbs={[{ label: t('prod.products'), onClick: () => navigate('/product-mgmt') }]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            <Badge variant="subtle" color="primary">
              {SERVICE_LINE_LABEL[product.serviceLine as ServiceLine] ?? product.serviceLine}
            </Badge>
            <Badge variant="subtle">
              {PRICING_METHOD_LABEL[product.pricingMethod as PricingMethod] ??
                product.pricingMethod}
            </Badge>
            <Badge variant="subtle" color={product.isActive ? 'success' : 'neutral'}>
              {product.isActive ? t('prod.on') : t('prod.off')}
            </Badge>
          </>
        }
      />

      <PageCard
        title={t('prod.bundleProducts')}
        count={rows.length}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setRows(toRows(product))}
            >
              {t('prod.revert')}
            </Button>
            <Button variant="primary" size="sm" disabled={!dirty} loading={saving} onClick={save}>
              {t('prod.save')}
            </Button>
          </div>
        }
      >
        <div
          style={{ fontSize: fs(13), color: 'var(--ark-color-text-secondary)', marginBottom: 10 }}
        >
          {t('prod.bundleHelp1')}
          {t('prod.bundleHelp2')}
          {t('prod.bundleHelp3')}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs(13) }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ark-color-border)' }}>
                {[
                  t('prod.col.order'),
                  t('prod.col.product'),
                  t('prod.col.role'),
                  t('prod.col.basePrice'),
                  t('prod.col.bundlePrice'),
                  '',
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      ...cell,
                      textAlign: 'left',
                      color: 'var(--ark-color-text-secondary)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = byId.get(r.addonServiceId);
                const volume = a?.kind === 'VOLUME';
                return (
                  <tr
                    key={r.addonServiceId}
                    style={{ borderBottom: '1px solid var(--ark-color-border)' }}
                  >
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('prod.up')}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('prod.down')}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={14} />
                      </Button>
                    </td>
                    <td style={{ ...cell, minWidth: 180 }}>
                      <span style={{ fontWeight: 600 }}>{a?.name ?? t('prod.deletedProduct')}</span>
                      {volume && (
                        <span style={{ marginLeft: 6 }}>
                          <Badge variant="subtle" color="info">
                            {t('prod.byItems')}
                          </Badge>
                        </span>
                      )}
                      {a && !a.isActive && (
                        <span style={{ marginLeft: 6, color: 'var(--ark-color-text-tertiary)' }}>
                          {t('prod.offParen')}
                        </span>
                      )}
                    </td>
                    <td style={{ ...cell, width: 140 }}>
                      <Select
                        value={r.role}
                        onValueChange={(v) => patch(i, { role: v as BundleRole })}
                        options={BUNDLE_ROLES.map((x) => ({
                          value: x,
                          label: BUNDLE_ROLE_LABEL[x],
                        }))}
                      />
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{won(a?.price)}</td>
                    <td style={{ ...cell, width: 190 }}>
                      <UnitField
                        value={r.price}
                        unit={volume ? '원/단위' : '원'}
                        ariaLabel={t('prod.bundlePriceOf', { v0: a?.name ?? '' })}
                        placeholder={a?.price != null ? String(Number(a.price)) : '0'}
                        onChange={(v) => patch(i, { price: v })}
                      />
                    </td>
                    <td style={{ ...cell, width: 44 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('prod.removeFromBundle')}
                        onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                      >
                        <X size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: fs(13) }}>
            {t('prod.noBundleProducts')}
          </div>
        )}
        {candidates.length > 0 && (
          <div style={{ maxWidth: 360, marginTop: 12 }}>
            <Select
              value=""
              onValueChange={add}
              options={candidates.map((a) => ({ value: a.id, label: a.name }))}
              placeholder={t('prod.addProduct')}
            />
          </div>
        )}
      </PageCard>
    </div>
  );
}
