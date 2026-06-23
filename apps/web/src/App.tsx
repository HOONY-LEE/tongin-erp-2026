import { useEffect, useState } from 'react';
import { ConfigProvider, Layout, Card, Tag, Typography } from 'antd';
import koKR from 'antd/locale/ko_KR';
import type { HealthResponse } from '@tongin/shared';

const { Header, Content } = Layout;

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <ConfigProvider locale={koKR}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>통인익스프레스 ERP</Header>
        <Content style={{ padding: 24 }}>
          <Card title="시스템 상태" style={{ maxWidth: 480 }}>
            API: {health ? <Tag color="green">{health.status}</Tag> : <Tag color="red">미연결</Tag>}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Phase 0 — 모노레포 스켈레톤 (FND-01)
            </Typography.Paragraph>
          </Card>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
