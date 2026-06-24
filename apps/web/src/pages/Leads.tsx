import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, ApiError } from '../lib/api';
import { useOptions } from '../lib/useOptions';

type Row = Record<string, unknown>;

const STATUS: Record<string, { label: string; color: string }> = {
  RECEIVED: { label: '접수', color: 'default' },
  CONSULT_ASSIGNED: { label: '상담배정', color: 'blue' },
  CONSULT_TOSS: { label: '상담토스', color: 'geekblue' },
  QUOTED: { label: '견적완료', color: 'gold' },
  CONTRACTED: { label: '계약', color: 'purple' },
  WORK_TOSS: { label: '작업토스', color: 'cyan' },
  IN_PROGRESS: { label: '작업중', color: 'processing' },
  DONE: { label: '완료', color: 'green' },
  CANCELED: { label: '취소', color: 'red' },
};
const SERVICE_LINES = [
  { value: 'MOVING', label: '이사(무빙)' },
  { value: 'LIVING', label: '리빙' },
  { value: 'CARE', label: '케어' },
  { value: 'B2B_MOVING', label: '기업이전' },
  { value: 'GENERAL', label: '일반' },
];

export default function Leads() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [transRow, setTransRow] = useState<Row | null>(null);
  const [form] = Form.useForm();
  const [transForm] = Form.useForm();
  const orgs = useOptions('/org-units', 'name');
  const customers = useOptions('/customers', 'name');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>('/leads'));
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (v: Row) => {
    try {
      await api('/leads', { method: 'POST', body: JSON.stringify(v) });
      message.success('리드가 접수되었습니다.');
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '접수 실패');
    }
  };

  const onTransition = async (v: { to: string }) => {
    if (!transRow) return;
    try {
      await api(`/leads/${transRow.id as string}/transition`, {
        method: 'POST',
        body: JSON.stringify(v),
      });
      message.success('상태가 변경되었습니다.');
      setTransRow(null);
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '상태 변경 실패');
    }
  };

  const columns: ColumnsType<Row> = [
    { title: '접수번호', dataIndex: 'leadNo' },
    {
      title: '상태',
      dataIndex: 'status',
      render: (v: string) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.label ?? v}</Tag>,
    },
    { title: '출처', dataIndex: 'source' },
    { title: '서비스', dataIndex: 'serviceLine' },
    {
      title: '이사 경로',
      render: (_: unknown, r: Row) =>
        r.fromAddr || r.toAddr ? `${r.fromAddr ?? '-'} → ${r.toAddr ?? '-'}` : '-',
    },
    {
      title: '작업',
      render: (_: unknown, r: Row) => (
        <Button size="small" onClick={() => setTransRow(r)}>
          상태변경
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          리드(접수) <Typography.Text type="secondary">({rows.length})</Typography.Text>
        </Typography.Title>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          + 접수 등록
        </Button>
      </Space>
      <Table<Row>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: true }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <Modal
        title="리드 접수 등록"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="등록"
        cancelText="취소"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} preserve={false}>
          <Form.Item name="orgUnitId" label="담당 지점" rules={[{ required: true }]}>
            <Select options={orgs} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="customerId" label="고객">
            <Select options={customers} showSearch optionFilterProp="label" allowClear />
          </Form.Item>
          <Form.Item name="source" label="접수경로">
            <Input placeholder="HOMEPAGE / AIBOT ..." />
          </Form.Item>
          <Form.Item name="serviceLine" label="서비스라인">
            <Select options={SERVICE_LINES} allowClear />
          </Form.Item>
          <Form.Item name="fromAddr" label="출발지">
            <Input />
          </Form.Item>
          <Form.Item name="toAddr" label="도착지">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`상태 변경 — ${(transRow?.leadNo as string) ?? ''}`}
        open={!!transRow}
        onCancel={() => setTransRow(null)}
        onOk={() => transForm.submit()}
        okText="변경"
        cancelText="취소"
        destroyOnHidden
      >
        <Form form={transForm} layout="vertical" onFinish={onTransition} preserve={false}>
          <Typography.Paragraph type="secondary">
            현재:{' '}
            <Tag color={STATUS[transRow?.status as string]?.color}>
              {STATUS[transRow?.status as string]?.label}
            </Tag>
          </Typography.Paragraph>
          <Form.Item name="to" label="변경할 상태" rules={[{ required: true }]}>
            <Select
              options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
