import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (v: { loginId: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      await login(v.loginId, v.password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#001529',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
          통인익스프레스 ERP
        </Typography.Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Form
          layout="vertical"
          initialValues={{ loginId: 'admin', password: 'admin1234' }}
          onFinish={onFinish}
        >
          <Form.Item name="loginId" label="아이디" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="password" label="비밀번호" rules={[{ required: true }]}>
            <Input.Password onPressEnter={() => undefined} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            로그인
          </Button>
        </Form>
      </Card>
    </div>
  );
}
