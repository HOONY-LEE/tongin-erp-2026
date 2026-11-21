import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { filterQuery } from '../lib/serverFilter';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  DataTable,
  FilterButton,
  PageHeader,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
} from '../components/ui';
import styles from './aiAdmin.module.css';
import { DatePicker } from '../components/ui';

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
  userId: string | null;
  loginId: string | null;
  userName: string | null;
}

const ACTION_LABEL: Record<Action, string> = {
  VIEW: i18n.t('logs.act.VIEW'),
  LIST: i18n.t('logs.act.LIST'),
  EXPORT: i18n.t('logs.act.EXPORT'),
};
const ACTION_COLOR: Record<Action, 'info' | 'neutral' | 'warning'> = {
  VIEW: 'info',
  LIST: 'neutral',
  EXPORT: 'warning',
};
const RESOURCE_LABEL: Record<string, string> = {
  customer: i18n.t('logs.res.customer'),
  lead: i18n.t('logs.res.lead'),
  estimate: i18n.t('logs.res.estimate'),
  contract: i18n.t('logs.res.contract'),
  support: 'A/S·CS',
  'service-order': i18n.t('logs.res.serviceOrder'),
  'work-order': i18n.t('logs.res.workOrder'),
  'work-order-ics': i18n.t('logs.res.workOrderIcs'),
  employee: i18n.t('logs.res.employee'),
  'employee-hr': i18n.t('logs.res.employeeHr'),
  'crm-lead': i18n.t('logs.res.crmLead'),
  'ai-file': i18n.t('logs.res.aiFile'),
  'drive-file': i18n.t('logs.res.driveFile'),
};
const resourceText = (r: AccessRow) =>
  r.resource.startsWith('table:')
    ? i18n.t('logs.res.table')
    : (RESOURCE_LABEL[r.resource] ?? r.resource);

/** 기록 한 줄 설명 — 내려받기는 파일·건수·가린 칸, 목록은 건수 */
function detailText(r: AccessRow): string {
  const d = r.detail ?? {};
  if (r.action === 'EXPORT' && d.fileName) {
    const masked = d.masked?.length
      ? i18n.t('logs.masked', { v0: d.masked.join(', ') })
      : i18n.t('logs.notMasked');
    return i18n.t('logs.exportInfo', {
      v0: d.fileName,
      v1: d.format ?? '',
      v2: d.rowCount ?? 0,
      v3: masked,
    });
  }
  if (typeof d.count === 'number') return i18n.t('logs.countN', { v0: d.count });
  return '';
}

const when = (iso: string) => fmtDateTime(iso, { seconds: true });
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
  /** 검색 옆 필터 — 종류는 서버에서 거르고(처음엔 내려받기만), 대상·사용자는 받은 목록에서 */
  const [flt, setFlt] = useState<FilterValues>({ action: 'EXPORT' });
  const action = (flt.action as string | undefined) ?? 'ALL';
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(false);
  /** 검색칸 — 서버에서 찾는다(경로·대상·사용자 이름/아이디) */
  const [q, setQ] = useState('');
  /** 대상·사용자 고르기 목록 — 거른 결과에 없는 것도 남게 본 것을 모은다 */
  const [seenTargets, setSeenTargets] = useState<Map<string, string>>(new Map());
  const [seenUsers, setSeenUsers] = useState<Map<string, string>>(new Map());
  // 종류는 원래 주소 조건(action)으로, 대상·사용자·검색은 f·q로 — 모두 서버에서
  const query = filterQuery({ ...flt, action: undefined }, q, {
    from,
    to,
    action: action !== 'ALL' ? action : undefined,
  });

  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const list = await api<AccessRow[]>(`/access-logs${query}`);
      if (my !== seq.current) return;
      setRows(list);
      setSeenTargets((prev) => {
        const m = new Map(prev);
        for (const r of list)
          m.set(r.resource.startsWith('table:') ? 'table' : r.resource, resourceText(r));
        return m;
      });
      setSeenUsers((prev) => {
        const m = new Map(prev);
        for (const r of list) if (r.userId) m.set(r.userId, r.userName ?? r.loginId ?? r.userId);
        return m;
      });
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('logs.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [query, toast]);
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
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

  const choices = (m: Map<string, string>) =>
    [...m.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
      .map(([value, label]) => ({ value, label }));
  const filterFields: FilterField[] = [
    {
      key: 'action',
      label: t('logs.flt.type'),
      type: 'single',
      options: (['EXPORT', 'VIEW', 'LIST'] as const).map((a) => ({
        value: a,
        label: ACTION_LABEL[a],
      })),
    },
    {
      key: 'target',
      label: t('logs.flt.target'),
      type: 'multi',
      options: choices(seenTargets),
    },
    {
      key: 'who',
      label: t('logs.flt.who'),
      type: 'multi',
      options: choices(seenUsers),
    },
  ];
  // 종류·대상·사용자·검색은 서버가 이미 걸렀다
  const listed = tableRows;

  const columns: Column[] = [
    { title: t('logs.col.at'), dataIndex: 'at', width: 170 },
    {
      title: t('logs.col.type'),
      dataIndex: 'actionText',
      width: 90,
      render: (r) => (
        <Badge variant="subtle" color={ACTION_COLOR[r.action as Action] ?? 'neutral'}>
          {String(r.actionText)}
        </Badge>
      ),
    },
    // 사람 이름이지만 기록을 보는 화면이라 가리기 대상에서 뺀다
    { title: t('logs.col.who'), dataIndex: 'who', width: 110, mask: false },
    { title: t('logs.col.loginId'), dataIndex: 'loginId', width: 130 },
    { title: t('logs.col.target'), dataIndex: 'target', width: 120 },
    { title: t('logs.col.message'), dataIndex: 'info', minWidth: 220, flex: 2 },
    { title: t('logs.col.path'), dataIndex: 'path', minWidth: 200, flex: 1 },
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
      {rows.length >= 1000 && <p className={styles.notice}>{t('logs.tooManyAccess')}</p>}
      <DataTable
        columns={columns}
        rows={listed as unknown as Row[]}
        loading={loading}
        exportable
        exportFileName={t('logs.accessExport', { v0: from, v1: to })}
        onSearch={setQ}
        filters={
          <>
            <FilterButton fields={filterFields} value={flt} onChange={setFlt} />
            <DatePicker
              className={styles.dateInput}
              value={from}
              max={to}
              aria-label={t('logs.from')}
              onChange={(v) => v && setFrom(v)}
            />
            <span className={styles.muted}>~</span>
            <DatePicker
              className={styles.dateInput}
              value={to}
              min={from}
              aria-label={t('logs.to')}
              onChange={(v) => v && setTo(v)}
            />
          </>
        }
      />
    </div>
  );
}
