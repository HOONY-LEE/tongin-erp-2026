import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  FormModal,
  PageCard,
  PageHeader,
  Spinner,
  useToast,
  type FormField,
  type Row,
} from '../components/ui';

const won = (v: unknown) => (v != null ? `${Number(v).toLocaleString()}원` : '-');

const PRICING: Record<string, string> = {
  CBM: 'CBM 기반',
  COST_PLUS: '원가적상식',
  FLAT: '정액',
  PYEONG: '평수',
};

interface AddonEntry {
  addonServiceId: string;
  priceOverride: string | number | null;
  addon: { id: string; code: string; name: string; unit: string; price: string | number | null };
  createdAt: string;
}

interface Product extends Row {
  id: string;
  code: string;
  name: string;
  category: string | null;
  serviceLine: string;
  pricingMethod: string;
  basePrice: string | number | null;
  isActive: boolean;
  addons: AddonEntry[];
}

const addonFields: FormField[] = [];

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [allAddons, setAllAddons] = useState<{ value: string; label: string }[]>([]);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [prod, addons] = await Promise.all([
        api<Product>(`/products/${id}`),
        api<Row[]>('/addon-services'),
      ]);
      setProduct(prod);
      setAllAddons(
        (addons as Array<{ id: string; code: string; name: string }>).map((a) => ({
          value: a.id,
          label: `[${a.code}] ${a.name}`,
        })),
      );
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '로드 실패' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddAddon = async (values: Record<string, unknown>) => {
    try {
      await api(`/products/${id}/addons`, {
        method: 'POST',
        body: JSON.stringify({
          addonServiceId: values.addonServiceId,
          priceOverride: values.priceOverride ? Number(values.priceOverride) : undefined,
        }),
      });
      toast({ type: 'success', title: '옵션이 연결되었습니다.' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '연결 실패' });
      throw e;
    }
  };

  const handleRemoveAddon = async (addonServiceId: string) => {
    try {
      await api(`/products/${id}/addons/${addonServiceId}`, { method: 'DELETE' });
      toast({ type: 'success', title: '옵션 연결이 해제되었습니다.' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '해제 실패' });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }
  if (!product) return null;

  const linkedIds = new Set(product.addons.map((a) => a.addonServiceId));
  const availableAddons = allAddons.filter((a) => !linkedIds.has(a.value));

  const addFields: FormField[] = [
    {
      name: 'addonServiceId',
      label: '옵션',
      required: true,
      type: 'select',
      options: availableAddons,
    },
    { name: 'priceOverride', label: '상품별 가격 (빈칸 = 옵션 기본가)', type: 'number' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={product.name}
        subtitle={`코드 ${product.code}`}
        breadcrumbs={[{ label: '목록', onClick: () => navigate(-1) }]}
        onRefresh={load}
        updatedAt={updatedAt}
        tags={
          <>
            <Badge variant="subtle" color="primary">
              {product.serviceLine}
            </Badge>
            <Badge variant="subtle">
              {PRICING[product.pricingMethod] ?? product.pricingMethod}
            </Badge>
            <Badge variant="subtle" color={product.isActive ? 'success' : 'neutral'}>
              {product.isActive ? '활성' : '비활성'}
            </Badge>
          </>
        }
      />

      {/* 기본 정보 */}
      <PageCard title="기본 정보">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px 24px',
            padding: '4px 0',
          }}
        >
          {[
            { label: '카테고리', value: product.category ?? '-' },
            { label: '기본가격', value: won(product.basePrice) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
      </PageCard>

      {/* 연결 옵션 */}
      <PageCard
        title="연결 옵션(부가서비스)"
        count={product.addons.length}
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={availableAddons.length === 0}>
            + 옵션 연결
          </Button>
        }
      >
        {product.addons.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            연결된 옵션이 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['코드', '옵션명', '단위', '옵션 기본가', '상품별 가격', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 12px',
                      textAlign: h === '옵션 기본가' || h === '상품별 가격' ? 'right' : 'left',
                      color: 'var(--color-text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {product.addons.map((entry) => (
                <tr key={entry.addonServiceId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px 12px' }}>{entry.addon.code}</td>
                  <td style={{ padding: '8px 12px' }}>{entry.addon.name}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <Badge variant="subtle">{entry.addon.unit}</Badge>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{won(entry.addon.price)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {entry.priceOverride != null ? (
                      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {won(entry.priceOverride)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>기본가 사용</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAddon(entry.addonServiceId)}
                    >
                      연결 해제
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageCard>

      <FormModal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="옵션 연결"
        fields={addFields}
        onSubmit={handleAddAddon}
      />
    </div>
  );
}
