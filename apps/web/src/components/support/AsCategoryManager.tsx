import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Modal } from '@sunghoon_lee/akron-ui';
import { api, ApiError } from '../../lib/api';
import { Button, Switch, useToast } from '../ui';
import styles from './AsCategoryManager.module.css';

interface Code {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}
const GROUP = 'AS_CATEGORY';

/**
 * A/S 접수 유형 관리(관리자) — 이름 고치기·쓰기/안 쓰기·추가. 지우지 않고 '사용'을 끈다
 * (이미 그 유형으로 접수된 건이 있어서).
 */
export function AsCategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Code[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (e: unknown) =>
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('asx.saveFailed') }),
    [toast, t],
  );
  const load = useCallback(async () => {
    try {
      const r = await api<Code[]>(`/common-codes?group=${GROUP}`);
      setRows([...r].sort((a, b) => a.sortOrder - b.sortOrder));
      setDraft({});
    } catch {
      toast({ type: 'error', title: t('asx.loadFailed') });
    }
  }, [toast, t]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const patch = async (id: string, body: Partial<Code>) => {
    setBusy(true);
    try {
      await api(`/common-codes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const rename = (r: Code) => {
    const v = (draft[r.id] ?? r.name).trim();
    if (!v || v === r.name) return;
    void patch(r.id, { name: v });
  };
  const add = async () => {
    const v = name.trim();
    if (!v) return;
    setBusy(true);
    try {
      await api('/common-codes', {
        method: 'POST',
        body: JSON.stringify({
          codeGroup: GROUP,
          // 코드는 안 보이는 값 — 겹치지 않게 시각으로
          code: `C${Date.now().toString(36).toUpperCase()}`,
          name: v,
          sortOrder: Math.max(0, ...rows.map((r) => r.sortOrder)) + 1,
          isActive: true,
        }),
      });
      setName('');
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('asx.manageTitle')}
      size="sm"
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('cc.close')}
        </Button>
      }
    >
      <ul className={styles.list}>
        {rows.map((r) => (
          <li key={r.id}>
            <Input
              value={draft[r.id] ?? r.name}
              maxLength={40}
              disabled={busy}
              onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
              onBlur={() => rename(r)}
              onKeyDown={(e) => e.key === 'Enter' && rename(r)}
              aria-label={r.name}
            />
            <span className={styles.toggle}>
              <Switch
                size="sm"
                checked={r.isActive}
                disabled={busy}
                onCheckedChange={(v: boolean) => void patch(r.id, { isActive: v })}
                label={t('asx.active')}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.add}>
        <Input
          value={name}
          maxLength={40}
          placeholder={t('asx.addPh')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <Button variant="outline" disabled={busy || !name.trim()} onClick={() => void add()}>
          {t('asx.add')}
        </Button>
      </div>
    </Modal>
  );
}
