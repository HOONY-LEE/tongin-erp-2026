import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam } from '../lib/useDetailParam';
import {
  Badge,
  CopyText,
  DataTable,
  Input,
  PageHeader,
  RecordDetail,
  Select,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import styles from './aiAdmin.module.css';

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

const LEVEL_LABEL = { ERROR: '오류', WARN: '경고' } as const;
const SOURCE_LABEL = { API: '서버', WEB: '화면' } as const;
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
 * 시스템 로그 — 서버·화면에서 난 오류와 경고. 직원이 알려 준 '오류 번호'를 검색칸에 넣으면 바로 찾는다.
 * 경고·오류만 남기고 30일(최대 2만 줄)이 지나면 지운다. 권한: SYSTEM_LOG.READ
 */
export default function SystemLogs() {
  const { t } = useTranslation();
  const toast = useToast();
  const { updatedAt, touch } = useUpdatedAt();
  const [from, setFrom] = useState(kstDate(6));
  const [to, setTo] = useState(kstDate());
  const [level, setLevel] = useState('ALL');
  const [source, setSource] = useState('ALL');
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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

  const columns: Column[] = [
    { title: '시각', dataIndex: 'at', width: 170 },
    {
      title: '종류',
      dataIndex: 'levelText',
      width: 76,
      render: (r) => (
        <Badge variant="subtle" color={r.level === 'ERROR' ? 'error' : 'warning'}>
          {String(r.levelText)}
        </Badge>
      ),
    },
    { title: '출처', dataIndex: 'sourceText', width: 70 },
    { title: '오류 번호', dataIndex: 'refText', width: 96 },
    { title: '내용', dataIndex: 'message', minWidth: 240, flex: 2 },
    { title: '요청', dataIndex: 'where', minWidth: 160, flex: 1 },
    { title: '사용자', dataIndex: 'who', width: 90 },
  ];

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;
  if (detailId) {
    return (
      <RecordDetail
        loading={!detail && loading}
        title={
          detail
            ? `${LEVEL_LABEL[detail.level]} · ${when(detail.createdAt)}`
            : '로그를 찾을 수 없습니다'
        }
        backLabel={t('nav.systemLogs')}
        onBack={close}
        sections={
          detail
            ? [
                {
                  title: '요약',
                  items: [
                    { label: '종류', value: LEVEL_LABEL[detail.level] },
                    { label: '출처', value: SOURCE_LABEL[detail.source] },
                    {
                      label: '오류 번호',
                      value: detail.ref ? <CopyText value={detail.ref} /> : null,
                    },
                    { label: '로거', value: detail.context },
                    {
                      label: '요청',
                      value: [detail.method, detail.path].filter(Boolean).join(' '),
                    },
                    { label: '응답 코드', value: detail.status },
                    { label: '사용자', value: detail.userName },
                    { label: '내용', value: detail.message, wide: true },
                  ],
                },
              ]
            : []
        }
      >
        {detail?.detail && (
          <section className="rd-card">
            <h3 className="rd-title">자세한 내용(스택)</h3>
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
          <span className={styles.cardLabel}>최근 24시간 오류</span>
          <span className={`${styles.cardValue} ${stats?.errors24h ? styles.errorValue : ''}`}>
            {stats ? stats.errors24h.toLocaleString('ko-KR') : '—'}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>최근 24시간 경고</span>
          <span className={styles.cardValue}>
            {stats ? stats.warnings24h.toLocaleString('ko-KR') : '—'}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>보관 중</span>
          <span className={styles.cardValue}>
            {stats ? `${stats.total.toLocaleString('ko-KR')}줄` : '—'}
          </span>
          <span className={styles.cardSub}>30일 · 최대 2만 줄까지 보관</span>
        </div>
      </div>
      {truncated && (
        <p className={styles.notice}>
          로그가 많아 최근 500줄만 보입니다. 기간·종류를 좁히거나 검색해 보세요.
        </p>
      )}
      <DataTable
        columns={columns}
        rows={tableRows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => open(String(r.id))}
        exportable
        exportFileName={`시스템로그-${from}-${to}`}
        filters={
          <>
            <Input
              value={q}
              placeholder="오류 번호·내용·주소"
              aria-label="로그 찾기"
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 200 }}
            />
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
              value={level}
              onValueChange={setLevel}
              aria-label="종류"
              options={[
                { value: 'ALL', label: '오류·경고' },
                { value: 'ERROR', label: '오류만' },
                { value: 'WARN', label: '경고만' },
              ]}
            />
            <Select
              value={source}
              onValueChange={setSource}
              aria-label="출처"
              options={[
                { value: 'ALL', label: '서버·화면' },
                { value: 'API', label: '서버' },
                { value: 'WEB', label: '화면' },
              ]}
            />
          </>
        }
      />
    </div>
  );
}
