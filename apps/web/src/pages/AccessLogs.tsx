import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  DataTable,
  Input,
  PageHeader,
  Select,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import styles from './aiAdmin.module.css';

type Action = 'VIEW' | 'LIST' | 'EXPORT';
interface AccessRow {
  id: string;
  createdAt: string;
  action: Action;
  resource: string;
  entityId: string | null;
  path: string;
  detail: {
    count?: number;
    fileName?: string;
    format?: string;
    rowCount?: number;
    columns?: string[];
    masked?: string[];
  } | null;
  loginId: string | null;
  userName: string | null;
}

const ACTION_LABEL: Record<Action, string> = { VIEW: '열람', LIST: '목록', EXPORT: '내려받기' };
const ACTION_COLOR: Record<Action, 'info' | 'neutral' | 'warning'> = {
  VIEW: 'info',
  LIST: 'neutral',
  EXPORT: 'warning',
};
const RESOURCE_LABEL: Record<string, string> = {
  customer: '고객',
  lead: '접수',
  estimate: '견적',
  contract: '계약',
  support: 'A/S·CS',
  'service-order': '서비스 주문',
  'work-order': '작업',
  'work-order-ics': '작업일정 파일',
  employee: '직원',
  'employee-hr': '인사기록',
  'crm-lead': '영업 대상',
  'ai-file': 'AI 파일',
  'drive-file': '드라이브 파일',
};
const resourceText = (r: AccessRow) =>
  r.resource.startsWith('table:') ? '표 내보내기' : (RESOURCE_LABEL[r.resource] ?? r.resource);

/** 기록 한 줄 설명 — 내려받기는 파일·건수·가린 칸, 목록은 건수 */
function detailText(r: AccessRow): string {
  const d = r.detail ?? {};
  if (r.action === 'EXPORT' && d.fileName) {
    const masked = d.masked?.length ? ` · 가림: ${d.masked.join(', ')}` : ' · 가림 없음';
    return `${d.fileName}.${d.format ?? ''} · ${d.rowCount ?? 0}건${masked}`;
  }
  if (typeof d.count === 'number') return `${d.count}건`;
  return '';
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
const kstDate = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600_000 - offsetDays * 24 * 3600_000).toISOString().slice(0, 10);

/**
 * 접근 기록 — 누가 언제 어떤 고객·직원 정보를 열람하고 내려받았는지(개인정보 접속기록).
 * 한 건 열람·고객 목록·내려받기(표 내보내기·작업일정·AI·드라이브 파일)를 남긴다. 권한: AUDIT.READ
 */
export default function AccessLogs() {
  const { t } = useTranslation();
  const toast = useToast();
  const { updatedAt, touch } = useUpdatedAt();
  const [from, setFrom] = useState(kstDate(6));
  const [to, setTo] = useState(kstDate());
  const [action, setAction] = useState('EXPORT');
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (action !== 'ALL') qs.set('action', action);
    try {
      setRows(await api<AccessRow[]>(`/access-logs?${qs.toString()}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [from, to, action, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const tableRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        at: when(r.createdAt),
        actionText: ACTION_LABEL[r.action] ?? r.action,
        target: resourceText(r),
        who: r.userName ?? r.loginId ?? '',
        info: detailText(r),
      })),
    [rows],
  );

  const columns: Column[] = [
    { title: '시각', dataIndex: 'at', width: 170 },
    {
      title: '종류',
      dataIndex: 'actionText',
      width: 90,
      render: (r) => (
        <Badge variant="subtle" color={ACTION_COLOR[r.action as Action] ?? 'neutral'}>
          {String(r.actionText)}
        </Badge>
      ),
    },
    // 사람 이름이지만 기록을 보는 화면이라 가리기 대상에서 뺀다
    { title: '사용자', dataIndex: 'who', width: 110, mask: false },
    { title: '아이디', dataIndex: 'loginId', width: 130 },
    { title: '대상', dataIndex: 'target', width: 120 },
    { title: '내용', dataIndex: 'info', minWidth: 220, flex: 2 },
    { title: '화면·요청', dataIndex: 'path', minWidth: 200, flex: 1 },
  ];

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('nav.accessLogs')}
        onRefresh={() => {
          void load();
          touch();
        }}
        updatedAt={updatedAt}
      />
      {rows.length >= 1000 && (
        <p className={styles.notice}>
          기록이 많아 최근 1000줄만 보입니다. 기간·종류를 좁혀 보세요.
        </p>
      )}
      <DataTable
        columns={columns}
        rows={tableRows as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={`접근기록-${from}-${to}`}
        filters={
          <>
            <Input
              type="date"
              className={styles.dateInput}
              value={from}
              max={to}
              aria-label="시작일"
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
            <span className={styles.muted}>~</span>
            <Input
              type="date"
              className={styles.dateInput}
              value={to}
              min={from}
              aria-label="종료일"
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
            <Select
              value={action}
              onValueChange={setAction}
              aria-label="종류"
              options={[
                { value: 'EXPORT', label: '내려받기' },
                { value: 'VIEW', label: '열람' },
                { value: 'LIST', label: '목록' },
                { value: 'ALL', label: '전체' },
              ]}
            />
          </>
        }
      />
    </div>
  );
}
