import { Button, Layout, Menu, Space, Typography } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', label: <Link to="/">대시보드</Link> },
  { key: '/leads', label: <Link to="/leads">리드(접수)</Link> },
  { key: '/customers', label: <Link to="/customers">고객</Link> },
  { key: '/products', label: <Link to="/products">상품</Link> },
  { key: '/cbm-items', label: <Link to="/cbm-items">품목사전</Link> },
  { key: '/org-units', label: <Link to="/org-units">조직</Link> },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const selected = menuItems.find(
    (m) => m.key === location.pathname || (m.key !== '/' && location.pathname.startsWith(m.key)),
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="dark">
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, padding: '16px 20px' }}>
          통인 ERP
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selected?.key ?? '/']} items={menuItems} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingInline: 24,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Space>
            <Typography.Text type="secondary">{user?.loginId}</Typography.Text>
            <Button size="small" onClick={logout}>
              로그아웃
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
