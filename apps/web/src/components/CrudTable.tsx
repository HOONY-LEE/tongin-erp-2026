import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@sunghoon_lee/akron-ui';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';

export type Row = Record<string, unknown>;

export interface Column {
  title: ReactNode;
  dataIndex?: string;
  numeric?: boolean;
  render?: (row: Row) => ReactNode;
}

export interface FormField {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface Props {
  title: string;
  path: string;
  columns: Column[];
  fields: FormField[];
}

export default function CrudTable({ title, path, columns, fields }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Row[]>(path));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [path, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (n: string, v: string) => setValues((s) => ({ ...s, [n]: v }));

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.name]) {
        toast({ type: 'warning', title: `${f.label} — ${t('common.required')}` });
        return;
      }
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (v === undefined || v === '') continue;
      payload[f.name] = f.type === 'number' ? Number(v) : v;
    }
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      toast({ type: 'success', title: t('common.created') });
      setOpen(false);
      setValues({});
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>
          {title}{' '}
          <span style={{ color: 'var(--ark-color-text-tertiary)', fontWeight: 400 }}>
            ({rows.length})
          </span>
        </h3>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          + {t('common.add')}
        </Button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) => (
                <TableHead key={i} numeric={c.numeric}>
                  {c.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={String(r.id)}>
                {columns.map((c, i) => (
                  <TableCell key={i} numeric={c.numeric}>
                    {c.render ? c.render(r) : String(r[c.dataIndex ?? ''] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`${title} ${t('common.add')}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map((f) =>
            f.type === 'select' ? (
              <Select
                key={f.name}
                label={f.label}
                value={values[f.name] ?? ''}
                onValueChange={(v) => setField(f.name, v)}
                options={f.options ?? []}
                placeholder={f.placeholder}
              />
            ) : (
              <Input
                key={f.name}
                label={f.label}
                type={f.type === 'number' ? 'number' : 'text'}
                value={values[f.name] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ),
          )}
        </div>
      </Modal>
    </Card>
  );
}
