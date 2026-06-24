import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import { api } from '../lib/api';

const CARDS: { key: string; path: string; label: string }[] = [
  { key: 'leads', path: '/leads', label: '리드(접수)' },
  { key: 'customers', path: '/customers', label: '고객' },
  { key: 'products', path: '/products', label: '상품' },
  { key: 'cbmItems', path: '/cbm-items', label: '품목사전' },
  { key: 'contracts', path: '/contracts', label: '계약' },
  { key: 'workOrders', path: '/work-orders', label: '작업오더' },
];

export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      CARDS.map((c) =>
        api<unknown[]>(c.path)
          .then((rows) => [c.key, rows.length] as const)
          .catch(() => [c.key, 0] as const),
      ),
    )
      .then((pairs) => setCounts(Object.fromEntries(pairs)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Typography.Title level={4}>대시보드</Typography.Title>
      <Row gutter={[16, 16]}>
        {CARDS.map((c) => (
          <Col key={c.key} xs={12} sm={8} md={8} lg={4}>
            <Card>
              <Statistic title={c.label} value={counts[c.key] ?? 0} loading={loading} />
            </Card>
          </Col>
        ))}
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
        통인익스프레스 ERP — 리드 → 견적 → 계약 → 결제 → 작업 프로세스가 동작합니다.
      </Typography.Paragraph>
    </div>
  );
}
