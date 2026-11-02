import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AI_ACCESS, AI_FEATURES, type AiAccess, type AiPrices } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Input,
  Modal,
  PageHeader,
  RecordDetail,
  SegmentedControl,
  Select,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { ChoiceChips } from '../components/approval/FormsAdmin';
import styles from './aiAdmin.module.css';

type Tab = 'overview' | 'users' | 'usage' | 'settings';

interface ModelDef {
  id: string;
  label: string;
  hint: string;
  chat: boolean;
}
interface Setting {
  allowed: string[];
  defaultModel: string;
  prices: AiPrices;
  monthlyTokenLimit: number | null;
  updatedAt: string | null;
}
interface SettingsRes {
  configured: boolean;
  models: ModelDef[];
  setting: Setting;
}
interface UserRow {
  userId: string;
  loginId: string;
  name: string | null;
  orgUnitName: string | null;
  positionName: string | null;
  active: boolean;
  isExternal: boolean;
  roleAllows: boolean;
  access: AiAccess;
  canUse: boolean;
  models: string[];
  monthlyTokenLimit: number | null;
  calls: number;
  tokens: number;
  cost: number | null;
}
interface UsageRow {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string;
  feature: keyof typeof AI_FEATURES;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  ok: boolean;
  error: string | null;
  refId: string | null;
  tokens: number;
  cost: number | null;
}
interface Summary {
  total: { calls: number; tokens: number; cost: number | null; failed: number; users: number };
  byModel: Record<string, { calls: number; tokens: number; cost: number | null }>;
  byFeature: Record<string, { calls: number; tokens: number }>;
}

const num = (n: number) => n.toLocaleString('ko-KR');
const usd = (n: number | null | undefined) =>
  n == null ? '—' : `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
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
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const thisMonth = () => kstToday().slice(0, 7);
const daysAgo = (n: number) =>
  new Date(Date.now() + 9 * 3600_000 - n * 24 * 3600_000).toISOString().slice(0, 10);
/** 최근 12달(이번 달부터) */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});
const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * AI 관리 — 회사 AI 모델·단가·기본 한도, 사용자별 AI 권한·모델·월 한도, 사용량과 사용 기록.
 * 권한: AI.ADMIN
 */
export default function AiAdmin() {
  const { t } = useTranslation();
  const { updatedAt, touch } = useUpdatedAt();
  const [refreshKey, setRefreshKey] = useState(0);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: '사용 현황' },
    { value: 'users', label: '사용자 권한' },
    { value: 'usage', label: '사용 기록' },
    { value: 'settings', label: '모델 설정' },
  ];
  const { tab, setTab } = useTabParam<Tab>('overview');
  // 사용자·사용 기록 상세를 열면 머리글·탭을 숨긴다(다른 관리 화면과 같게)
  const [params] = useSearchParams();
  const inDetail = params.has('user') || params.has('log');
  const [settings, setSettings] = useState<SettingsRes | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await api<SettingsRes>('/ai-admin/settings'));
    } catch {
      setSettings(null);
    }
  }, []);
  useEffect(() => {
    void loadSettings();
  }, [loadSettings, refreshKey]);

  return (
    <div className={styles.stack}>
      {!inDetail && (
        <PageHeader
          title={t('nav.aiAdmin')}
          onRefresh={() => {
            setRefreshKey((k) => k + 1);
            touch();
          }}
          updatedAt={updatedAt}
          footer={
            <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)} options={tabs} />
          }
        />
      )}
      {settings && !settings.configured && !inDetail && (
        <p className={`${styles.notice} ${styles.warn}`}>
          서버에 Claude API 키(ANTHROPIC_API_KEY)가 없어 AI를 쓸 수 없습니다. 설정은 미리 해 둘 수
          있습니다.
        </p>
      )}
      {tab === 'overview' ? (
        <Overview key={`o-${refreshKey}`} models={settings?.models ?? []} />
      ) : tab === 'users' ? (
        <Users key={`u-${refreshKey}`} settings={settings} />
      ) : tab === 'usage' ? (
        <UsageLog key={`l-${refreshKey}`} />
      ) : (
        settings && (
          <SettingsForm
            key={`s-${refreshKey}-${settings.setting.updatedAt}`}
            data={settings}
            onSaved={setSettings}
          />
        )
      )}
    </div>
  );
}

const modelName = (models: ModelDef[], id: string) => models.find((m) => m.id === id)?.label ?? id;

// ── 사용 현황 ──

function Overview({ models }: { models: ModelDef[] }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<Summary>(`/ai-admin/summary?month=${month}`)
      .then(setS)
      .catch((e) => toast({ type: 'error', title: errText(e, '불러오지 못했습니다') }))
      .finally(() => setLoading(false));
  }, [month, toast]);

  const modelRows = Object.entries(s?.byModel ?? {}).map(([id, v]) => ({
    id,
    name: modelName(models, id),
    ...v,
  }));
  const featureRows = Object.entries(s?.byFeature ?? {}).map(([id, v]) => ({
    id,
    name: AI_FEATURES[id as keyof typeof AI_FEATURES] ?? id,
    ...v,
  }));

  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <div className={styles.monthSelect}>
          <Select
            value={month}
            onValueChange={setMonth}
            options={MONTHS.map((m) => ({ value: m, label: monthLabel(m) }))}
            aria-label="달"
          />
        </div>
      </div>
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>AI 호출</span>
          <span className={styles.cardValue}>{s ? num(s.total.calls) : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>사용 토큰</span>
          <span className={styles.cardValue}>{s ? num(s.total.tokens) : '—'}</span>
          <span className={styles.cardSub}>입력 + 출력(캐시 읽기 제외)</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>예상 비용</span>
          <span className={styles.cardValue}>{s ? usd(s.total.cost) : '—'}</span>
          <span className={styles.cardSub}>모델 설정의 단가 기준</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>쓴 사람</span>
          <span className={styles.cardValue}>{s ? `${num(s.total.users)}명` : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>실패한 호출</span>
          <span className={`${styles.cardValue} ${s?.total.failed ? styles.errorValue : ''}`}>
            {s ? num(s.total.failed) : '—'}
          </span>
        </div>
      </div>
      <div className={styles.breakdowns}>
        <Breakdown
          title="모델별"
          loading={loading}
          rows={modelRows.map((r) => ({
            key: r.id,
            name: r.name,
            calls: r.calls,
            tokens: r.tokens,
            cost: r.cost,
          }))}
          showCost
        />
        <Breakdown
          title="기능별"
          loading={loading}
          rows={featureRows.map((r) => ({
            key: r.id,
            name: r.name,
            calls: r.calls,
            tokens: r.tokens,
          }))}
        />
      </div>
    </div>
  );
}

/** 모델별·기능별 사용량 — 줄 몇 개뿐이라 표 대신 간단한 목록 */
function Breakdown({
  title,
  rows,
  loading,
  showCost,
}: {
  title: string;
  rows: { key: string; name: string; calls: number; tokens: number; cost?: number | null }[];
  loading: boolean;
  showCost?: boolean;
}) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p className={styles.hint}>
          {loading ? '불러오는 중…' : '이 달에는 사용 기록이 없습니다.'}
        </p>
      ) : (
        <div className={styles.breakdown} data-cost={showCost ? '' : undefined}>
          <span className={styles.modelHead}>이름</span>
          <span className={styles.modelHead}>호출</span>
          <span className={styles.modelHead}>토큰</span>
          {showCost && <span className={styles.modelHead}>예상 비용</span>}
          {rows.map((r) => (
            <Fragment key={r.key}>
              <span>{r.name}</span>
              <span className={styles.numCell}>{num(r.calls)}</span>
              <span className={styles.numCell}>{num(r.tokens)}</span>
              {showCost && <span className={styles.numCell}>{usd(r.cost)}</span>}
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

// ── 사용자 권한 ──

const accessBadge = (r: UserRow) =>
  r.access === 'BLOCK' ? (
    <Badge variant="subtle" color="error">
      막음
    </Badge>
  ) : r.canUse ? (
    <Badge variant="subtle" color="success">
      {r.access === 'ALLOW' ? '허용' : '사용 가능'}
    </Badge>
  ) : (
    <Badge variant="subtle" color="neutral">
      권한 없음
    </Badge>
  );

function Users({ settings }: { settings: SettingsRes | null }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const { id: detailId, open, close } = useDetailParam('user');
  const models = settings?.models ?? [];
  const companyLimit = settings?.setting.monthlyTokenLimit ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<UserRow[]>(`/ai-admin/users?month=${month}`));
    } catch (e) {
      toast({ type: 'error', title: errText(e, '불러오지 못했습니다') });
    } finally {
      setLoading(false);
    }
  }, [month, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const limitOf = (r: UserRow) => r.monthlyTokenLimit ?? companyLimit;
  const limitText = (r: UserRow) => {
    const l = limitOf(r);
    return l == null ? '무제한' : `${num(l)}${r.monthlyTokenLimit == null ? ' (회사 기본)' : ''}`;
  };
  const modelsText = (r: UserRow) =>
    r.models.length ? r.models.map((m) => modelName(models, m)).join(', ') : '회사 설정 전부';

  // 많이 쓴 사람 먼저, 같으면 이름순
  const shown = rows
    .filter((r) => !onlyActive || r.active)
    .sort(
      (a, b) =>
        b.tokens - a.tokens || (a.name ?? a.loginId).localeCompare(b.name ?? b.loginId, 'ko'),
    );
  const tableRows = shown.map((r) => ({
    ...r,
    id: r.userId,
    who: r.name ?? r.loginId,
    org: r.isExternal ? '외부 업체' : (r.orgUnitName ?? ''),
    position: r.positionName ?? '',
    accessText: r.access === 'BLOCK' ? '막음' : r.canUse ? '사용 가능' : '권한 없음',
    modelsText: modelsText(r),
    limitText: limitText(r),
  }));

  const columns: Column[] = [
    { title: '이름', dataIndex: 'who', width: 120 },
    { title: 'ID', dataIndex: 'loginId', width: 130 },
    { title: '소속', dataIndex: 'org', minWidth: 120, flex: 1 },
    { title: '직책', dataIndex: 'position', width: 80 },
    {
      title: 'AI 사용',
      dataIndex: 'accessText',
      width: 110,
      render: (r) => accessBadge(r as unknown as UserRow),
    },
    { title: '쓸 수 있는 모델', dataIndex: 'modelsText', minWidth: 140, flex: 1 },
    { title: '월 한도(토큰)', dataIndex: 'limitText', width: 170 },
    {
      title: '호출',
      dataIndex: 'calls',
      width: 80,
      numeric: true,
      render: (r) => num(Number(r.calls)),
    },
    {
      title: '사용 토큰',
      dataIndex: 'tokens',
      width: 130,
      numeric: true,
      render: (r) => num(Number(r.tokens)),
    },
    {
      title: '예상 비용',
      dataIndex: 'cost',
      width: 110,
      numeric: true,
      render: (r) => usd(r.cost as number | null),
    },
  ];

  const detail = detailId ? rows.find((r) => r.userId === detailId) : null;
  const modal = editing && (
    <PolicyModal
      user={editing}
      models={models.filter((m) => settings?.setting.allowed.includes(m.id))}
      companyLimit={companyLimit}
      onClose={() => setEditing(null)}
      onSaved={async () => {
        setEditing(null);
        await load();
      }}
    />
  );

  if (detailId) {
    return (
      <>
        <RecordDetail
          loading={!detail && loading}
          title={detail ? (detail.name ?? detail.loginId) : '계정을 찾을 수 없습니다'}
          backLabel="사용자 권한"
          onBack={close}
          actions={
            detail ? (
              <Button variant="primary" size="sm" onClick={() => setEditing(detail)}>
                권한·한도 편집
              </Button>
            ) : undefined
          }
          sections={
            detail
              ? [
                  {
                    title: '계정',
                    items: [
                      { label: 'ID', value: detail.loginId },
                      { label: '소속', value: detail.orgUnitName },
                      { label: '직책', value: detail.positionName },
                    ],
                  },
                  {
                    title: 'AI 권한',
                    items: [
                      { label: 'AI 사용', value: accessBadge(detail) },
                      { label: '정하는 방법', value: AI_ACCESS[detail.access] },
                      {
                        label: '권한 그룹',
                        value: detail.roleAllows ? "'AI 비서 사용' 있음" : "'AI 비서 사용' 없음",
                      },
                      { label: '쓸 수 있는 모델', value: modelsText(detail) },
                      { label: '월 한도(토큰)', value: limitText(detail) },
                    ],
                  },
                  {
                    title: `${monthLabel(month)} 사용량`,
                    items: [
                      { label: '호출', value: `${num(detail.calls)}번` },
                      {
                        label: '사용 토큰',
                        value: (() => {
                          const l = limitOf(detail);
                          return l
                            ? `${num(detail.tokens)} / ${num(l)} (${Math.round((detail.tokens / l) * 100)}%)`
                            : num(detail.tokens);
                        })(),
                      },
                      { label: '예상 비용', value: usd(detail.cost) },
                    ],
                  },
                ]
              : []
          }
        >
          {detail && <UsageLog userId={detail.userId} compact />}
        </RecordDetail>
        {modal}
      </>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={tableRows as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => open(String(r.id))}
        exportable
        exportFileName={`AI-사용자-${month}`}
        filters={
          <>
            <div className={styles.monthSelect}>
              <Select
                value={month}
                onValueChange={setMonth}
                options={MONTHS.map((m) => ({ value: m, label: monthLabel(m) }))}
                aria-label="달"
              />
            </div>
            <Checkbox
              checked={onlyActive}
              onCheckedChange={(c) => setOnlyActive(c === true)}
              label="쓰는 계정만"
            />
          </>
        }
      />
      {modal}
    </>
  );
}

function PolicyModal({
  user,
  models,
  companyLimit,
  onClose,
  onSaved,
}: {
  user: UserRow;
  models: ModelDef[];
  companyLimit: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [access, setAccess] = useState<AiAccess>(user.access);
  const [allModels, setAllModels] = useState(user.models.length === 0);
  const [picked, setPicked] = useState<string[]>(user.models);
  const [limitMode, setLimitMode] = useState(user.monthlyTokenLimit == null ? 'company' : 'own');
  const [limit, setLimit] = useState(String(user.monthlyTokenLimit ?? ''));
  const [busy, setBusy] = useState(false);
  const limitNum = Number(limit.replace(/,/g, ''));
  const limitOk =
    limitMode === 'company' || (limit.trim() !== '' && Number.isInteger(limitNum) && limitNum >= 0);
  const modelsOk = allModels || picked.length > 0;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/ai-admin/users/${user.userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          access,
          models: allModels ? [] : picked,
          monthlyTokenLimit: limitMode === 'company' ? null : limitNum,
        }),
      });
      toast({ type: 'success', title: '저장했습니다' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: errText(e, '저장하지 못했습니다') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${user.name ?? user.loginId} — AI 권한`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!limitOk || !modelsOk}
            onClick={() => void save()}
          >
            저장
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          AI 사용
          <ChoiceChips
            value={access}
            onChange={(v) => setAccess(v as AiAccess)}
            options={(Object.keys(AI_ACCESS) as AiAccess[]).map((k) => ({
              value: k,
              label: AI_ACCESS[k],
            }))}
          />
          <p className={styles.hint}>
            {access === 'DEFAULT'
              ? `권한 그룹의 'AI 비서 사용'을 따릅니다 — 지금 ${user.roleAllows ? '있음(사용 가능)' : '없음(사용 못 함)'}`
              : access === 'ALLOW'
                ? '권한 그룹과 상관없이 AI 비서를 쓸 수 있습니다'
                : 'AI 비서·에이전트 AI 단계를 쓸 수 없습니다'}
          </p>
        </div>
        <div className={styles.field}>
          쓸 수 있는 모델
          <ChoiceChips
            value={allModels ? 'all' : 'pick'}
            onChange={(v) => setAllModels(v === 'all')}
            options={[
              { value: 'all', label: '회사에 열린 모델 전부' },
              { value: 'pick', label: '골라서 주기' },
            ]}
          />
          {!allModels && (
            <div className={styles.checks}>
              {models.map((m) => (
                <Checkbox
                  key={m.id}
                  checked={picked.includes(m.id)}
                  label={m.label}
                  onCheckedChange={(c) =>
                    setPicked((cur) =>
                      c === true ? [...cur, m.id] : cur.filter((x) => x !== m.id),
                    )
                  }
                />
              ))}
            </div>
          )}
          {!modelsOk && <p className={styles.hint}>모델을 하나 이상 골라 주세요.</p>}
        </div>
        <div className={styles.field}>
          월 한도(토큰)
          <ChoiceChips
            value={limitMode}
            onChange={setLimitMode}
            options={[
              {
                value: 'company',
                label: `회사 기본 따르기(${companyLimit == null ? '무제한' : num(companyLimit)})`,
              },
              { value: 'own', label: '따로 정하기' },
            ]}
          />
          {limitMode === 'own' && (
            <div className={styles.inline}>
              <Input
                className={styles.limitInput}
                inputMode="numeric"
                value={limit}
                placeholder="예: 2000000"
                onChange={(e) => setLimit(e.target.value.replace(/[^\d,]/g, ''))}
              />
              <span className={styles.muted}>토큰 / 달 (0이면 못 씀)</span>
            </div>
          )}
          <p className={styles.hint}>
            이번 달 {num(user.tokens)} 토큰을 썼습니다. 한도를 넘으면 다음 달 1일(한국 시간)까지
            AI를 쓸 수 없습니다.
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ── 사용 기록 ──

function UsageLog({ userId, compact }: { userId?: string; compact?: boolean }) {
  const toast = useToast();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(kstToday());
  const [feature, setFeature] = useState('ALL');
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelDef[]>([]);
  const { id: detailId, open, close } = useDetailParam('log');

  useEffect(() => {
    api<SettingsRes>('/ai-admin/settings')
      .then((s) => setModels(s.models))
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (userId) qs.set('userId', userId);
    if (feature !== 'ALL') qs.set('feature', feature);
    api<{ rows: UsageRow[]; truncated: boolean }>(`/ai-admin/usage?${qs.toString()}`)
      .then((r) => {
        setRows(r.rows);
        setTruncated(r.truncated);
      })
      .catch((e) => toast({ type: 'error', title: errText(e, '불러오지 못했습니다') }))
      .finally(() => setLoading(false));
  }, [from, to, feature, userId, toast]);

  const tableRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        at: when(r.createdAt),
        featureName: AI_FEATURES[r.feature] ?? r.feature,
        modelName: modelName(models, r.model),
        result: r.ok ? '성공' : '실패',
        seconds: (r.durationMs / 1000).toFixed(1),
      })),
    [rows, models],
  );

  const columns: Column[] = [
    { title: '시각', dataIndex: 'at', width: 170 },
    ...(userId ? [] : [{ title: '사용자', dataIndex: 'userName', width: 110 }]),
    { title: '기능', dataIndex: 'featureName', width: 140 },
    { title: '모델', dataIndex: 'modelName', minWidth: 140, flex: 1 },
    {
      title: '입력',
      dataIndex: 'inputTokens',
      width: 100,
      numeric: true,
      render: (r) => num(Number(r.inputTokens)),
    },
    {
      title: '출력',
      dataIndex: 'outputTokens',
      width: 100,
      numeric: true,
      render: (r) => num(Number(r.outputTokens)),
    },
    {
      title: '캐시 읽기',
      dataIndex: 'cacheReadTokens',
      width: 110,
      numeric: true,
      render: (r) => num(Number(r.cacheReadTokens)),
    },
    {
      title: '비용',
      dataIndex: 'cost',
      width: 100,
      numeric: true,
      render: (r) => usd(r.cost as number | null),
    },
    { title: '걸린 시간(초)', dataIndex: 'seconds', width: 110, numeric: true },
    {
      title: '결과',
      dataIndex: 'result',
      width: 80,
      render: (r) => (
        <Badge variant="subtle" color={r.ok ? 'success' : 'error'}>
          {String(r.result)}
        </Badge>
      ),
    },
  ];

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;
  if (detailId && !compact) {
    return (
      <RecordDetail
        loading={!detail && loading}
        title={
          detail
            ? `${AI_FEATURES[detail.feature] ?? detail.feature} · ${when(detail.createdAt)}`
            : '기록을 찾을 수 없습니다'
        }
        backLabel="사용 기록"
        onBack={close}
        sections={
          detail
            ? [
                {
                  title: '호출',
                  items: [
                    { label: '사용자', value: detail.userName },
                    { label: '기능', value: AI_FEATURES[detail.feature] ?? detail.feature },
                    { label: '모델', value: modelName(models, detail.model) },
                    { label: '결과', value: detail.ok ? '성공' : '실패' },
                    { label: '걸린 시간', value: `${(detail.durationMs / 1000).toFixed(1)}초` },
                    { label: '대화·실행 id', value: detail.refId },
                  ],
                },
                {
                  title: '토큰',
                  items: [
                    { label: '입력', value: num(detail.inputTokens) },
                    { label: '출력', value: num(detail.outputTokens) },
                    { label: '캐시 쓰기', value: num(detail.cacheWriteTokens) },
                    { label: '캐시 읽기', value: num(detail.cacheReadTokens) },
                    { label: '한도에 센 토큰', value: num(detail.tokens) },
                    { label: '예상 비용', value: usd(detail.cost) },
                  ],
                },
                ...(detail.error
                  ? [{ title: '오류', items: [{ label: '내용', value: detail.error, wide: true }] }]
                  : []),
              ]
            : []
        }
      />
    );
  }

  return (
    <div className={styles.stack}>
      {truncated && (
        <p className={styles.notice}>기록이 많아 최근 2,000건만 보입니다. 기간을 줄여 보세요.</p>
      )}
      <DataTable
        columns={columns}
        rows={tableRows as unknown as Row[]}
        loading={loading}
        onRowClick={compact ? undefined : (r) => open(String(r.id))}
        exportable
        exportFileName={`AI-사용기록-${from}-${to}`}
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
              value={feature}
              onValueChange={setFeature}
              aria-label="기능"
              options={[
                { value: 'ALL', label: '모든 기능' },
                ...Object.entries(AI_FEATURES).map(([value, label]) => ({ value, label })),
              ]}
            />
          </>
        }
      />
    </div>
  );
}

// ── 모델 설정 ──

function SettingsForm({ data, onSaved }: { data: SettingsRes; onSaved: (s: SettingsRes) => void }) {
  const toast = useToast();
  const [allowed, setAllowed] = useState<string[]>(data.setting.allowed);
  const [def, setDef] = useState(data.setting.defaultModel);
  const [prices, setPrices] = useState<Record<string, { input: string; output: string }>>(() =>
    Object.fromEntries(
      data.models.map((m) => [
        m.id,
        {
          input: String(data.setting.prices[m.id]?.input ?? ''),
          output: String(data.setting.prices[m.id]?.output ?? ''),
        },
      ]),
    ),
  );
  const [limitMode, setLimitMode] = useState(
    data.setting.monthlyTokenLimit == null ? 'none' : 'limit',
  );
  const [limit, setLimit] = useState(String(data.setting.monthlyTokenLimit ?? ''));
  const [busy, setBusy] = useState(false);

  const chatModels = data.models.filter((m) => m.chat && allowed.includes(m.id));
  const limitNum = Number(limit.replace(/,/g, ''));
  const limitOk = limitMode === 'none' || (limit.trim() !== '' && Number.isInteger(limitNum));
  const defOk = chatModels.some((m) => m.id === def);
  const priceBad = Object.values(prices).some(
    (p) => (p.input.trim() === '') !== (p.output.trim() === ''),
  );

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        allowed,
        defaultModel: def,
        prices: Object.fromEntries(
          Object.entries(prices)
            .filter(([, p]) => p.input.trim() && p.output.trim())
            .map(([id, p]) => [id, { input: Number(p.input), output: Number(p.output) }]),
        ),
        monthlyTokenLimit: limitMode === 'none' ? null : limitNum,
      };
      const res = await api<SettingsRes>('/ai-admin/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      toast({ type: 'success', title: '저장했습니다' });
      onSaved(res);
    } catch (e) {
      toast({ type: 'error', title: errText(e, '저장하지 못했습니다') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.form}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>쓸 모델</h3>
        <p className={styles.hint}>
          켠 모델만 AI 비서·에이전트에서 고를 수 있습니다. 단가(달러 / 100만 토큰)를 넣으면 사용
          현황에 예상 비용이 나옵니다 — Anthropic 콘솔 요금표의 값을 넣으세요.
        </p>
        <div className={`${styles.modelRow} ${styles.modelHead}`}>
          <span>모델</span>
          <span>입력 단가($)</span>
          <span>출력 단가($)</span>
        </div>
        {data.models.map((m) => (
          <div key={m.id} className={styles.modelRow}>
            <div className={styles.modelName}>
              <Checkbox
                checked={allowed.includes(m.id)}
                onCheckedChange={(c) =>
                  setAllowed((cur) => (c === true ? [...cur, m.id] : cur.filter((x) => x !== m.id)))
                }
                label={m.label}
              />
              <span className={styles.modelHint}>
                {m.chat ? '대화·에이전트' : '짧은 분류·요약'}
              </span>
            </div>
            <Input
              inputMode="decimal"
              value={prices[m.id]?.input ?? ''}
              placeholder="비움"
              aria-label={`${m.label} 입력 단가`}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  [m.id]: { ...p[m.id], input: e.target.value.replace(/[^\d.]/g, '') },
                }))
              }
            />
            <Input
              inputMode="decimal"
              value={prices[m.id]?.output ?? ''}
              placeholder="비움"
              aria-label={`${m.label} 출력 단가`}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  [m.id]: { ...p[m.id], output: e.target.value.replace(/[^\d.]/g, '') },
                }))
              }
            />
          </div>
        ))}
        {!allowed.length && <p className={styles.hint}>모델을 하나 이상 켜 두어야 합니다.</p>}
        {priceBad && <p className={styles.hint}>단가는 입력·출력을 함께 넣어 주세요.</p>}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>기본 모델</h3>
        <p className={styles.hint}>
          AI 비서 새 대화와 에이전트 만들기에 쓰는 모델입니다. 켜 둔 대화용 모델 중에서 고릅니다.
        </p>
        <ChoiceChips
          value={def}
          onChange={setDef}
          options={chatModels.map((m) => ({ value: m.id, label: m.label }))}
        />
        {!defOk && <p className={styles.hint}>기본 모델을 골라 주세요.</p>}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>기본 월 한도</h3>
        <p className={styles.hint}>
          사람마다 따로 정하지 않은 계정에 쓰는 한 달 한도입니다(입력 + 출력 토큰, 캐시 읽기 제외).
          사람별 한도는 &apos;사용자 권한&apos;에서 정합니다.
        </p>
        <ChoiceChips
          value={limitMode}
          onChange={setLimitMode}
          options={[
            { value: 'none', label: '무제한' },
            { value: 'limit', label: '한도 정하기' },
          ]}
        />
        {limitMode === 'limit' && (
          <div className={styles.inline}>
            <Input
              className={styles.limitInput}
              inputMode="numeric"
              value={limit}
              placeholder="예: 5000000"
              onChange={(e) => setLimit(e.target.value.replace(/[^\d,]/g, ''))}
            />
            <span className={styles.muted}>토큰 / 사람 / 달</span>
          </div>
        )}
      </section>

      <div className={styles.actions}>
        {data.setting.updatedAt && (
          <span className={styles.muted} style={{ marginRight: 'auto' }}>
            마지막 저장 {when(data.setting.updatedAt)}
          </span>
        )}
        <Button
          variant="primary"
          loading={busy}
          disabled={!allowed.length || !defOk || !limitOk || priceBad}
          onClick={() => void save()}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
