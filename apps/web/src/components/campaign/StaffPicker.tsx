import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { useAuth } from '../../auth/AuthContext';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Input,
  PhoneInput,
  useToast,
  type Column,
  type Row,
} from '../ui';
import styles from '../../pages/campaign.module.css';

/** 받는 직원(이름·번호는 담을 때 화면에 보여 줄 값 — 서버는 직원 원장에서 다시 읽는다) */
export interface StaffPick {
  name: string;
  phone: string;
  orgUnit: string | null;
}
/** 직접 입력한 받는 사람(대표님 등 시연 번호) — 키는 숫자만 */
export interface ExtraPick {
  name: string;
  phone: string;
}

interface StaffRow {
  id: string;
  name: string;
  phone: string;
  orgUnit: string | null;
  role: string | null;
  allowed: boolean;
}
interface DemoNumber {
  code: string;
  name: string;
  phone: string;
}

const SIZE = 20;
export const phoneKey = (p: string) => p.replace(/\D/g, '');
const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

/**
 * 받는 사람 — '직원·시연 번호' 탭. 시연할 때 고객(가짜 번호) 대신 직원이나 대표님 번호로 보내 본다.
 * 직원은 이름·전화번호로 찾아 체크하고, 직원이 아닌 번호는 직접 추가한다(시연 번호로 저장 → 문자 허용 번호).
 */
export function StaffPicker({
  pickedStaff,
  onToggleStaff,
  extras,
  onToggleExtra,
}: {
  pickedStaff: Map<string, StaffPick>;
  onToggleStaff: (id: string, pick: StaffPick | null) => void;
  extras: Map<string, ExtraPick>;
  onToggleExtra: (pick: ExtraPick, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  // 시연 번호는 전체 문자 허용목록이라 권한 관리자만 고친다
  const canWrite = can('ROLE.UPDATE');
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    total: number;
    restricted: boolean;
    rows: StaffRow[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState<DemoNumber[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [adding, setAdding] = useState(false);

  // 입력하는 동안은 잠깐 기다렸다가 찾는다
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [keyword]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await api('/campaigns/audience/staff', {
          method: 'POST',
          body: JSON.stringify({ keyword: q || undefined, page, pageSize: SIZE }),
        }),
      );
    } catch (e) {
      toast({
        type: 'error',
        title: e instanceof ApiError ? e.message : t('camp.staffSearchFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [q, page, toast]);

  const loadDemo = useCallback(async () => {
    try {
      setDemo(await api<DemoNumber[]>('/campaigns/demo-numbers'));
    } catch {
      setDemo([]);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);
  useEffect(() => {
    void loadDemo();
  }, [loadDemo]);

  /** 시연 번호로 저장(문자 허용 번호에 들어간다) */
  const saveDemo = async (name: string, phone: string) => {
    const saved = await api<DemoNumber>('/campaigns/demo-numbers', {
      method: 'POST',
      body: JSON.stringify({ name, phone }),
    });
    await Promise.all([loadDemo(), loadStaff()]);
    return saved;
  };

  const addNumber = async () => {
    const phone = newPhone.trim();
    if (!PHONE_RE.test(phone)) {
      toast({ type: 'warning', title: t('camp.phoneInvalid') });
      return;
    }
    setAdding(true);
    try {
      const saved = await saveDemo(newName.trim() || formatPhone(phone), phone);
      onToggleExtra({ name: saved.name, phone: saved.phone }, true);
      setNewName('');
      setNewPhone('');
      toast({
        type: 'success',
        title: t('camp.addedOne', { v0: saved.name, v1: formatPhone(saved.phone) }),
      });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.addOneFailed') });
    } finally {
      setAdding(false);
    }
  };

  const allowStaff = async (r: StaffRow) => {
    try {
      await saveDemo(r.name, r.phone);
      toast({ type: 'success', title: t('camp.allowed', { v0: r.name }) });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.allowFailed') });
    }
  };

  const removeDemo = async (d: DemoNumber) => {
    if (!window.confirm(t('camp.demoDeleteQ', { v0: d.name, v1: formatPhone(d.phone) }))) return;
    try {
      await api(`/campaigns/demo-numbers/${d.code}`, { method: 'DELETE' });
      onToggleExtra({ name: d.name, phone: d.phone }, false);
      await Promise.all([loadDemo(), loadStaff()]);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('camp.removeFailed') });
    }
  };

  const rows = data?.rows ?? [];

  return (
    <div className={styles.col}>
      {data?.restricted && (
        <div className={styles.notice}>
          {t('camp.demoNote1')} <b>{t('camp.demoNote2')}</b>
          {t('camp.demoNote3')}
          {t('camp.demoNote4')}
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>{t('camp.findStaff')}</span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('camp.staffSearchPh')}
          aria-label={t('camp.staffSearch')}
        />
      </div>

      <div className={styles.tableWrap}>
        <DataTable
          bare
          pageSize={0}
          loading={loading && !rows.length}
          columns={[
            {
              title: '',
              width: 48,
              mask: false,
              render: (r) => (
                <Checkbox
                  checked={pickedStaff.has(String(r.id))}
                  onCheckedChange={(v) =>
                    onToggleStaff(
                      String(r.id),
                      v === true
                        ? {
                            name: String(r.name),
                            phone: String(r.phone),
                            orgUnit: (r.orgUnit as string | null) ?? null,
                          }
                        : null,
                    )
                  }
                  aria-label={t('camp.selectOf', { v0: String(r.name) })}
                />
              ),
            },
            { title: t('camp.col.name'), dataIndex: 'name' },
            {
              title: t('camp.col.phone'),
              dataIndex: 'phone',
              render: (r) => formatPhone(String(r.phone ?? '')),
            },
            {
              title: t('camp.col.branch'),
              dataIndex: 'orgUnit',
              render: (r) => String(r.orgUnit ?? '-'),
            },
            {
              title: t('camp.col.position'),
              dataIndex: 'role',
              render: (r) => String(r.role ?? '-'),
            },
            ...(data?.restricted
              ? [
                  {
                    title: t('camp.col.sms'),
                    dataIndex: 'allowed',
                    render: (r: Row) =>
                      r.allowed ? (
                        <Badge variant="subtle" color="success">
                          {t('camp.allow')}
                        </Badge>
                      ) : (
                        <span className={styles.inline}>
                          <Badge variant="subtle" color="warning">
                            {t('camp.block')}
                          </Badge>
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t('camp.allowTip')}
                              onClick={() => void allowStaff(r as unknown as (typeof rows)[number])}
                            >
                              {t('camp.allowBtn')}
                            </Button>
                          )}
                        </span>
                      ),
                  } as Column,
                ]
              : []),
          ]}
          rows={rows as unknown as Row[]}
        />
      </div>
      {data && data.total > SIZE && (
        <div className={styles.pager}>
          <span>
            {data.total}
            {t('camp.ofPeople')} {(page - 1) * SIZE + 1}–{Math.min(page * SIZE, data.total)}
          </span>
          <div className={styles.inline}>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('camp.prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * SIZE >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('camp.next')}
            </Button>
          </div>
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>{t('camp.demoNumbers')}</span>
        {demo.length > 0 && (
          <div className={styles.tableWrap}>
            <DataTable
              bare
              pageSize={0}
              rowKey="code"
              columns={[
                {
                  title: '',
                  width: 48,
                  mask: false,
                  render: (r) => (
                    <Checkbox
                      checked={extras.has(String(r.code))}
                      onCheckedChange={(v) =>
                        onToggleExtra({ name: String(r.name), phone: String(r.phone) }, v === true)
                      }
                      aria-label={t('camp.selectOf', { v0: String(r.name) })}
                    />
                  ),
                },
                { title: t('camp.col.name'), dataIndex: 'name' },
                {
                  title: t('camp.col.phone'),
                  dataIndex: 'phone',
                  flex: 1,
                  render: (r) => formatPhone(String(r.phone ?? '')),
                },
                {
                  title: '',
                  width: 60,
                  mask: false,
                  render: (r) =>
                    canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('camp.demoDeleteOf', { v0: String(r.name) })}
                        title={t('camp.demoDelete')}
                        onClick={() => void removeDemo(r as unknown as (typeof demo)[number])}
                      >
                        <Trash2 size={14} />
                      </Button>
                    ),
                },
              ]}
              rows={demo as unknown as Row[]}
            />
          </div>
        )}
        {canWrite && (
          <div className={styles.inline}>
            <div style={{ width: 160 }}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('camp.demoNamePh')}
                maxLength={30}
                aria-label={t('camp.demoName')}
              />
            </div>
            <div style={{ width: 180 }}>
              <PhoneInput
                value={newPhone}
                onChange={setNewPhone}
                onKeyUp={(e) => e.key === 'Enter' && void addNumber()}
                aria-label={t('camp.demoPhone')}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus size={13} />}
              loading={adding}
              disabled={!newPhone.trim()}
              onClick={() => void addNumber()}
            >
              {t('camp.addNumber')}
            </Button>
          </div>
        )}
        <span className={styles.sub}>
          {t('camp.addNumberHint1')}
          {t('camp.addNumberHint2')}
        </span>
      </div>
    </div>
  );
}
