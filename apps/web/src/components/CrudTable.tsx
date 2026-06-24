import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, ApiError } from '../lib/api';

export interface FormField {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

type Row = Record<string, unknown>;

interface Props {
  title: string;
  path: string;
  columns: ColumnsType<Row>;
  fields: FormField[];
  canWrite?: boolean;
}

export default function CrudTable({ title, path, columns, fields, canWrite = true }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>(path));
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (values: Row) => {
    setSaving(true);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(values) });
      message.success('등록되었습니다.');
      setOpen(false);
      form.resetFields();
      await load();
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title} <Typography.Text type="secondary">({rows.length})</Typography.Text>
        </Typography.Title>
        {canWrite && (
          <Button type="primary" onClick={() => setOpen(true)}>
            + 추가
          </Button>
        )}
      </Space>
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: true }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />
      <Modal
        title={`${title} 추가`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="저장"
        cancelText="취소"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} preserve={false}>
          {fields.map((f) => (
            <Form.Item
              key={f.name}
              name={f.name}
              label={f.label}
              rules={f.required ? [{ required: true, message: `${f.label} 필수` }] : undefined}
            >
              {f.type === 'number' ? (
                <InputNumber style={{ width: '100%' }} />
              ) : f.type === 'select' ? (
                <Select options={f.options} allowClear showSearch optionFilterProp="label" />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
}
