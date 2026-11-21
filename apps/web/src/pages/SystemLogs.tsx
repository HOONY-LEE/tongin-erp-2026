import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  CopyText,
  DataTable,
  FilterButton,
  filterRows,
  Input,
  PageHeader,
  RecordDetail,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
} from '../components/ui';
import styles from './aiAdmin.module.css';
import { DatePicker } from '../components/ui';

interface LogRow {
  id: string;
  createdAt: string;
  level: 'ERROR' | 'WARN';
  source: 'API' | 'WEB';
  context: string | null;
  message: string;
  detail: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  userId: string | null;
  userName: string | null;
  ref: string | null;
}
interface Stats {
  errors24h: number;
  warnings24h: number;
  total: number;
}

const LEVEL_LABEL = { ERROR: i18n.t('logs.level.ERROR'), WARN: i18n.t('logs.level.WARN') } as const;
const SOURCE_LABEL = { API: i18n.t('logs.src.API'), WEB: i18n.t('logs.src.WEB') } as const;
const when = (iso: string) => fmtDateTime(iso, { seconds: true });
const kstDate = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600_000 - offsetDays * 24 * 3600_000).toISOString().slice(0, 10);

/**
 * 시스템 로그 — 서버·화면에서 난 오류와 경고. 직원이 알려 준 '오류 번호'를 검색칸에 넣으면 바로 찾는다.
 * 경고·오류만 남기고 30일(최대 2만 줄)이 지나면 지운다. 권한: SYSTEM_LOG.READ
 */
export default function SystemLogs() {
  const { t } = useTranslation();
  const toast = useToast();
  const { updatedAt, touch } = useUpdatedAt();
  const [from, setFrom] = useState(kstDate(6));
  const [to, setTo] = useState(kstDate());
  /** 검색 옆 필터 — 종류·출처는 서버에서 거르고, 사용자는 받은 목록에서 */
  const [flt, setFlt] = useState<FilterValues>({});
  const level = (flt.level as string | undefined) ?? 'ALL';
  const source = (flt.source as string | undefined) ?? 'ALL';
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const { id: detailId, open, close } = useDetailParam();

  // 검색어는 치는 동안 바로 부르지 않고 잠깐 멈추면
  useEffect(() => {
    const h = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(h);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (level !== 'ALL') qs.set('level', level);
    if (source !== 'ALL') qs.set('source', source);
    if (query) qs.set('q', query);
    try {
      const [r, s] = await Promise.all([
        api<{ rows: LogRow[]; truncated: boolean }>(`/system-logs?${qs.toString()}`),
        api<Stats>('/system-logs/stats'),
      ]);
      setRows(r.rows);
      setTruncated(r.truncated);
      setStats(s);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('logs.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [from, to, level, source, query, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const tableRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        at: when(r.createdAt),
        levelText: LEVEL_LABEL[r.level],
        sourceText: SOURCE_LABEL[r.source],
        where: [r.method, r.path].filter(Boolean).join(' '),
        who: r.userName ?? '',
        refText: r.ref ?? '',
      })),
    [rows],
  );

  const filterFields: FilterField[] = [
    {
      key: 'level',
      label: t('logs.flt.type'),
      type: 'single',
      options: [
        { value: 'ERROR', label: LEVEL_LABEL.ERROR },
        { value: 'WARN', label: LEVEL_LABEL.WARN },
      ],
    },
    {
      key: 'source',
      label: t('logs.flt.source'),
      type: 'single',
      options: [
        { value: 'API', label: SOURCE_LABEL.API },
        { value: 'WEB', label: SOURCE_LABEL.WEB },
      ],
    },
    {
      key: 'who',
      label: t('logs.flt.who'),
      type: 'multi',
      options: [...new Set(tableRows.map((r) => r.who).filter(Boolean))].map((v) => ({
        value: v,
        label: v,
      })),
    },
  ];
  // 종류·출처는 이미 서버가 걸렀다 — 사용자만 여기서
  const listed = filterRows(
    tableRows,
    filterFields.filter((f) => f.key === 'who'),
    flt,
    (r, key) => r[key as keyof typeof r],
  );

  const columns: Column[] = [
    { title: t('logs.col.at'), dataIndex: 'at', width: 170 },
    {
      title: t('logs.col.type'),
      dataIndex: 'levelText',
      width: 76,
      render: (r) => (
        <Badge variant="subtle" color={r.level === 'ERROR' ? 'error' : 'warning'}>
          {String(r.levelText)}
        </Badge>
      ),
    },
    { title: t('logs.col.source'), dataIndex: 'sourceText', width: 70 },
    { title: t('logs.col.ref'), dataIndex: 'refText', width: 96 },
    { title: t('logs.col.message'), dataIndex: 'message', minWidth: 240, flex: 2 },
    { title: t('logs.col.where'), dataIndex: 'where', minWidth: 160, flex: 1 },
    { title: t('logs.col.who'), dataIndex: 'who', width: 90 },
  ];

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;
  if (detailId) {
    return (
      <RecordDetail
        loading={!detail && loading}
        title={
          detail ? `${LEVEL_LABEL[detail.level]} · ${when(detail.createdAt)}` : t('logs.notFound')
        }
        backLabel={t('nav.systemLogs')}
        onBack={close}
        sections={
          detail
            ? [
                {
                  title: t('logs.summary'),
                  items: [
                    { label: t('logs.col.type'), value: LEVEL_LABEL[detail.level] },
                    { label: t('logs.col.source'), value: SOURCE_LABEL[detail.source] },
                    {
                      label: t('logs.col.ref'),
                      value: detail.ref ? <CopyText value={detail.ref} /> : null,
                    },
                    { label: t('logs.logger'), value: detail.context },
                    {
                      label: t('logs.col.where'),
                      value: [detail.method, detail.path].filter(Boolean).join(' '),
                    },
                    { label: t('logs.status'), value: detail.status },
                    { label: t('logs.col.who'), value: detail.userName },
                    { label: t('logs.col.message'), value: detail.message, wide: true },
                  ],
                },
              ]
            : []
        }
      >
        {detail?.detail && (
          <section className="rd-card">
            <h3 className="rd-title">{t('logs.stack')}</h3>
            <pre className={styles.pre}>{detail.detail}</pre>
          </section>
        )}
      </RecordDetail>
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('nav.systemLogs')}
        onRefresh={() => {
          void load();
          touch();
        }}
        updatedAt={updatedAt}
      />
      <div className={`${styles.cards} ${styles.cards3}`}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('logs.errors24')}</span>
          <span className={`${styles.cardValue} ${stats?.errors24h ? styles.errorValue : ''}`}>
            {stats ? stats.errors24h.toLocaleString('ko-KR') : '—'}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('logs.warns24')}</span>
          <span className={styles.cardValue}>
            {stats ? stats.warnings24h.toLocaleString('ko-KR') : '—'}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('logs.stored')}</span>
          <span className={styles.cardValue}>
            {stats ? t('logs.linesN', { v0: stats.total.toLocaleString('ko-KR') }) : '—'}
          </span>
          <span className={styles.cardSub}>{t('logs.retention')}</span>
        </div>
      </div>
      {truncated && <p className={styles.notice}>{t('logs.tooMany')}</p>}
      <DataTable
        columns={columns}
        rows={listed as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => open(String(r.id))}
        exportable
        exportFileName={t('logs.exportName', { v0: from, v1: to })}
        filters={
          <>
            <FilterButton fields={filterFields} value={flt} onChange={setFlt} />
            <Input
              value={q}
              placeholder={t('logs.searchPh')}
              aria-label={t('logs.search')}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 200 }}
            />
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
