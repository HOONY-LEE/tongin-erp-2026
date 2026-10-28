import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Checkbox, Input, useToast } from '../ui';
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '직원을 찾지 못했습니다' });
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
      toast({ type: 'warning', title: '전화번호 형식이 아닙니다(예: 010-1234-5678).' });
      return;
    }
    setAdding(true);
    try {
      const saved = await saveDemo(newName.trim() || formatPhone(phone), phone);
      onToggleExtra({ name: saved.name, phone: saved.phone }, true);
      setNewName('');
      setNewPhone('');
      toast({ type: 'success', title: `${saved.name}(${saved.phone})을 담았습니다` });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '추가하지 못했습니다' });
    } finally {
      setAdding(false);
    }
  };

  const allowStaff = async (r: StaffRow) => {
    try {
      await saveDemo(r.name, r.phone);
      toast({ type: 'success', title: `${r.name} 번호를 시연 번호로 허용했습니다` });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '허용하지 못했습니다' });
    }
  };

  const removeDemo = async (d: DemoNumber) => {
    if (
      !window.confirm(
        `시연 번호 ${d.name}(${d.phone})을 지울까요? 이 번호로는 문자가 나가지 않습니다.`,
      )
    )
      return;
    try {
      await api(`/campaigns/demo-numbers/${d.code}`, { method: 'DELETE' });
      onToggleExtra({ name: d.name, phone: d.phone }, false);
      await Promise.all([loadDemo(), loadStaff()]);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  const rows = data?.rows ?? [];

  return (
    <div className={styles.col}>
      {data?.restricted && (
        <div className={styles.notice}>
          지금은 시연 중이라 <b>허용 번호</b>(시연 번호로 등록한 번호 · 서버 허용 번호)로만 실제
          문자가 나갑니다. 고객 번호와 허용되지 않은 직원 번호는 보내지 않고 실패로 남습니다.
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>직원 찾기</span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름·전화번호 (하이픈 없이 숫자만 넣어도 됩니다)"
          aria-label="직원 이름·전화번호 검색"
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>이름</th>
              <th>연락처</th>
              <th>지점</th>
              <th>직책</th>
              {data?.restricted && <th>문자 발송</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = pickedStaff.has(r.id);
              return (
                <tr key={r.id} className={on ? styles.rowOn : ''}>
                  <td>
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) =>
                        onToggleStaff(
                          r.id,
                          v === true ? { name: r.name, phone: r.phone, orgUnit: r.orgUnit } : null,
                        )
                      }
                      aria-label={`${r.name} 선택`}
                    />
                  </td>
                  <td>{r.name}</td>
                  <td>{formatPhone(r.phone)}</td>
                  <td>{r.orgUnit ?? '-'}</td>
                  <td>{r.role ?? '-'}</td>
                  {data?.restricted && (
                    <td>
                      {r.allowed ? (
                        <Badge variant="subtle" color="success">
                          허용
                        </Badge>
                      ) : (
                        <span className={styles.inline}>
                          <Badge variant="subtle" color="warning">
                            차단
                          </Badge>
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="실제 번호가 맞는지 확인한 뒤 허용하세요"
                              onClick={() => void allowStaff(r)}
                            >
                              허용하기
                            </Button>
                          )}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                  {loading ? '찾는 중…' : '맞는 직원이 없습니다(재직 중·번호 있는 직원만).'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > SIZE && (
        <div className={styles.pager}>
          <span>
            {data.total}명 중 {(page - 1) * SIZE + 1}–{Math.min(page * SIZE, data.total)}
          </span>
          <div className={styles.inline}>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * SIZE >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>시연 번호 (대표님 등 직원 목록에 없는 번호)</span>
        {demo.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                {demo.map((d) => {
                  const on = extras.has(d.code);
                  return (
                    <tr key={d.code} className={on ? styles.rowOn : ''}>
                      <td style={{ width: 36 }}>
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) =>
                            onToggleExtra({ name: d.name, phone: d.phone }, v === true)
                          }
                          aria-label={`${d.name} 선택`}
                        />
                      </td>
                      <td>{d.name}</td>
                      <td>{d.phone}</td>
                      <td style={{ width: 60 }}>
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${d.name} 시연 번호 지우기`}
                            title="시연 번호에서 지우기"
                            onClick={() => void removeDemo(d)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canWrite && (
          <div className={styles.inline}>
            <div style={{ width: 160 }}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="이름 (예: 대표님)"
                maxLength={30}
                aria-label="추가할 이름"
              />
            </div>
            <div style={{ width: 180 }}>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && void addNumber()}
                placeholder="010-1234-5678"
                inputMode="tel"
                aria-label="추가할 전화번호"
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
              번호 직접 추가
            </Button>
          </div>
        )}
        <span className={styles.sub}>
          추가한 번호는 시연 번호로 저장되어 다음 캠페인에서도 고를 수 있고, 문자 허용 번호에
          들어갑니다.
        </span>
      </div>
    </div>
  );
}
