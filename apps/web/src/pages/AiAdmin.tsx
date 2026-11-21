import i18n from '../i18n';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDateTime } from '../lib/dateFormat';
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
  FilterButton,
  filterRows,
  Input,
  Modal,
  PageHeader,
  RecordDetail,
  SegmentedControl,
  Select,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
} from '../components/ui';
import { ChoiceChips } from '../components/ui';
import styles from './aiAdmin.module.css';
import { DatePicker } from '../components/ui';

type Tab = 'overview' | 'users' | 'usage' | 'settings';

interface ModelDef {
  id: string;
  label: string;
  hint: string;
  chat: boolean;
  lifecycle?: 'active' | 'deprecated';
  createdAt?: string | null;
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
  /** 모델 목록을 Claude에서 받아 왔는지(live)·언제 */
  catalog: { live: boolean; fetchedAt: string | null };
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
  roleAllowsBuilder: boolean;
  builderAccess: AiAccess;
  canBuild: boolean;
  /** 전체 권한(*) 계정 — 막을 수 없다 */
  superUser: boolean;
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
const when = (iso: string) => fmtDateTime(iso, { seconds: true });
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
const monthLabel = (m: string) =>
  i18n.t('aiadm.yearMonth', { v0: m.slice(0, 4), v1: Number(m.slice(5)) });

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
    { value: 'overview', label: t('aiadm.tab.usage') },
    { value: 'users', label: t('aiadm.tab.users') },
    { value: 'usage', label: t('aiadm.tab.logs') },
    { value: 'settings', label: t('aiadm.tab.models') },
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
          {t('aiadm.noKey1')}
          {t('aiadm.noKey2')}
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
  const { t } = useTranslation();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [s, setS] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<Summary>(`/ai-admin/summary?month=${month}`)
      .then(setS)
      .catch((e) => toast({ type: 'error', title: errText(e, t('aiadm.loadFailed')) }))
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
            aria-label={t('aiadm.month')}
          />
        </div>
      </div>
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('aiadm.calls')}</span>
          <span className={styles.cardValue}>{s ? num(s.total.calls) : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('aiadm.tokens')}</span>
          <span className={styles.cardValue}>{s ? num(s.total.tokens) : '—'}</span>
          <span className={styles.cardSub}>{t('aiadm.tokensHint')}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('aiadm.cost')}</span>
          <span className={styles.cardValue}>{s ? usd(s.total.cost) : '—'}</span>
          <span className={styles.cardSub}>{t('aiadm.costHint')}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('aiadm.users')}</span>
          <span className={styles.cardValue}>
            {s ? t('aiadm.peopleN', { v0: num(s.total.users) }) : '—'}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{t('aiadm.failed')}</span>
          <span className={`${styles.cardValue} ${s?.total.failed ? styles.errorValue : ''}`}>
            {s ? num(s.total.failed) : '—'}
          </span>
        </div>
      </div>
      <div className={styles.breakdowns}>
        <Breakdown
          title={t('aiadm.byModel')}
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
          title={t('aiadm.byFeature')}
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
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p className={styles.hint}>{loading ? t('aiadm.loading') : t('aiadm.noUsage')}</p>
      ) : (
        <div className={styles.breakdown} data-cost={showCost ? '' : undefined}>
          <span className={styles.modelHead}>{t('aiadm.col.name')}</span>
          <span className={styles.modelHead}>{t('aiadm.col.calls')}</span>
          <span className={styles.modelHead}>{t('aiadm.col.tokens')}</span>
          {showCost && <span className={styles.modelHead}>{t('aiadm.cost')}</span>}
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
      {i18n.t('aiadm.blocked')}
    </Badge>
  ) : r.canUse ? (
    <Badge variant="subtle" color="success">
      {r.access === 'ALLOW' ? i18n.t('aiadm.allowed') : i18n.t('aiadm.usable')}
    </Badge>
  ) : (
    <Badge variant="subtle" color="neutral">
      {i18n.t('aiadm.noAccess')}
    </Badge>
  );

function Users({ settings }: { settings: SettingsRes | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  /** 검색 옆 필터 — 처음엔 쓰는 계정만(예전 '쓰는 계정만' 체크) */
  const [flt, setFlt] = useState<FilterValues>({ active: 'true' });
  const [editing, setEditing] = useState<UserRow | null>(null);
  // 표 편집 모드 — 'AI 사용'·'에이전트 빌더'를 체크박스로 고치고 저장해야 적용된다
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Map<string, { use?: boolean; builder?: boolean }>>(new Map());
  const [savingDraft, setSavingDraft] = useState(false);
  const { id: detailId, open, close } = useDetailParam('user');
  const models = settings?.models ?? [];
  const companyLimit = settings?.setting.monthlyTokenLimit ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<UserRow[]>(`/ai-admin/users?month=${month}`));
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('aiadm.loadFailed')) });
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
    return l == null
      ? t('aiadm.unlimited')
      : `${num(l)}${r.monthlyTokenLimit == null ? t('aiadm.companyDefault') : ''}`;
  };
  // 따로 고르지 않았으면 회사에 열린 모델 — 어느 모델인지 이름으로
  const companyModels = settings?.setting.allowed ?? [];
  const modelsText = (r: UserRow) =>
    (r.models.length ? r.models : companyModels).map((m) => modelName(models, m)).join(', ') || '—';

  const useOf = (r: UserRow) => draft.get(r.userId)?.use ?? r.canUse;
  const buildOf = (r: UserRow) => draft.get(r.userId)?.builder ?? r.canBuild;
  const setDraftOf = (r: UserRow, patch: { use?: boolean; builder?: boolean }) =>
    setDraft((d) => {
      const n = new Map(d);
      const next = { ...n.get(r.userId), ...patch };
      // 원래 값으로 돌아오면 고친 목록에서 뺀다
      if (next.use === r.canUse) delete next.use;
      if (next.builder === r.canBuild) delete next.builder;
      if (next.use === undefined && next.builder === undefined) n.delete(r.userId);
      else n.set(r.userId, next);
      return n;
    });
  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      await api('/ai-admin/users-access', {
        method: 'PUT',
        body: JSON.stringify({
          changes: [...draft.entries()].map(([userId, c]) => ({ userId, ...c })),
        }),
      });
      toast({ type: 'success', title: t('aiadm.savedN', { v0: draft.size }) });
      setDraft(new Map());
      setEditMode(false);
      await load();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('aiadm.saveFailed')) });
    } finally {
      setSavingDraft(false);
    }
  };
  const checkCell = (r: UserRow, kind: 'use' | 'builder') => {
    const on = kind === 'use' ? useOf(r) : buildOf(r);
    const changed =
      kind === 'use'
        ? draft.get(r.userId)?.use !== undefined
        : draft.get(r.userId)?.builder !== undefined;
    const how = kind === 'use' ? r.access : r.builderAccess;
    return (
      <span
        className={`${styles.checkCell} ${changed ? styles.checkChanged : ''}`}
        title={
          r.superUser
            ? t('aiadm.superCannotOff')
            : how === 'DEFAULT'
              ? t('aiadm.followRole')
              : t('aiadm.personal', { v0: AI_ACCESS[how] })
        }
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={on}
          disabled={!editMode || r.superUser}
          aria-label={kind === 'use' ? t('aiadm.useAssistant') : t('aiadm.useBuilder')}
          onCheckedChange={(c) =>
            setDraftOf(r, kind === 'use' ? { use: c === true } : { builder: c === true })
          }
        />
        {how !== 'DEFAULT' && !changed && (
          <span className={styles.ownMark}>{t('aiadm.personalMark')}</span>
        )}
      </span>
    );
  };

  const distinct = (vs: (string | null)[]) =>
    [...new Set(vs.filter((v): v is string => !!v))]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((v) => ({ value: v, label: v }));
  const onOff = [
    { value: 'true', label: t('aiadm.on') },
    { value: 'false', label: t('aiadm.off') },
  ];
  const filterFields: FilterField[] = [
    {
      key: 'active',
      label: t('aiadm.flt.account'),
      type: 'single',
      options: [
        { value: 'true', label: t('aiadm.flt.activeAcc') },
        { value: 'false', label: t('aiadm.flt.inactiveAcc') },
      ],
    },
    {
      key: 'org',
      label: t('aiadm.flt.org'),
      type: 'multi',
      options: distinct(rows.map((r) => (r.isExternal ? t('aiadm.external') : r.orgUnitName))),
    },
    {
      key: 'positionName',
      label: t('aiadm.flt.position'),
      type: 'multi',
      options: distinct(rows.map((r) => r.positionName)),
    },
    { key: 'canUse', label: t('aiadm.flt.assistant'), type: 'single', options: onOff },
    { key: 'canBuild', label: t('aiadm.flt.builder'), type: 'single', options: onOff },
    {
      key: 'used',
      label: t('aiadm.flt.used'),
      type: 'single',
      options: [
        { value: 'true', label: t('aiadm.flt.usedYes') },
        { value: 'false', label: t('aiadm.flt.usedNo') },
      ],
    },
  ];

  // 많이 쓴 사람 먼저, 같으면 이름순
  const shown = filterRows(rows, filterFields, flt, (r, key) =>
    key === 'org'
      ? r.isExternal
        ? t('aiadm.external')
        : r.orgUnitName
      : key === 'used'
        ? String(r.calls > 0)
        : key === 'active' || key === 'canUse' || key === 'canBuild'
          ? String(r[key])
          : r[key as keyof UserRow],
  ).sort(
    (a, b) => b.tokens - a.tokens || (a.name ?? a.loginId).localeCompare(b.name ?? b.loginId, 'ko'),
  );
  const tableRows = shown.map((r) => ({
    ...r,
    id: r.userId,
    who: r.name ?? r.loginId,
    org: r.isExternal ? t('aiadm.external') : (r.orgUnitName ?? ''),
    position: r.positionName ?? '',
    accessText: r.canUse ? t('aiadm.on') : t('aiadm.off'),
    builderText: r.canBuild ? t('aiadm.on') : t('aiadm.off'),
    modelsText: modelsText(r),
    limitText: limitText(r),
  }));

  const columns: Column[] = [
    { title: t('aiadm.col.name'), dataIndex: 'who', width: 120 },
    { title: 'ID', dataIndex: 'loginId', width: 130 },
    { title: t('aiadm.col.org'), dataIndex: 'org', minWidth: 120, flex: 1 },
    { title: t('aiadm.col.position'), dataIndex: 'position', width: 80 },
    {
      title: t('aiadm.col.assistant'),
      dataIndex: 'accessText',
      width: 90,
      render: (r) => checkCell(r as unknown as UserRow, 'use'),
    },
    {
      title: t('aiadm.col.builder'),
      dataIndex: 'builderText',
      width: 130,
      render: (r) => checkCell(r as unknown as UserRow, 'builder'),
    },
    { title: t('aiadm.col.models'), dataIndex: 'modelsText', minWidth: 140, flex: 1 },
    { title: t('aiadm.col.limit'), dataIndex: 'limitText', width: 170 },
    {
      title: t('aiadm.col.calls'),
      dataIndex: 'calls',
      width: 80,
      numeric: true,
      render: (r) => num(Number(r.calls)),
    },
    {
      title: t('aiadm.tokens'),
      dataIndex: 'tokens',
      width: 130,
      numeric: true,
      render: (r) => num(Number(r.tokens)),
    },
    {
      title: t('aiadm.cost'),
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
          title={detail ? (detail.name ?? detail.loginId) : t('aiadm.notFound')}
          backLabel={t('aiadm.tab.users')}
          onBack={close}
          actions={
            detail ? (
              <Button variant="primary" size="sm" onClick={() => setEditing(detail)}>
                {t('aiadm.editAccess')}
              </Button>
            ) : undefined
          }
          sections={
            detail
              ? [
                  {
                    title: t('aiadm.account'),
                    items: [
                      { label: 'ID', value: detail.loginId },
                      { label: t('aiadm.col.org'), value: detail.orgUnitName },
                      { label: t('aiadm.col.position'), value: detail.positionName },
                    ],
                  },
                  {
                    title: t('aiadm.aiAccess'),
                    items: [
                      { label: t('aiadm.col.assistant'), value: accessBadge(detail) },
                      { label: t('aiadm.howSet'), value: AI_ACCESS[detail.access] },
                      {
                        label: t('aiadm.col.builder'),
                        value: (
                          <Badge variant="subtle" color={detail.canBuild ? 'success' : 'neutral'}>
                            {detail.canBuild ? t('aiadm.usable') : t('aiadm.noAccess')}
                          </Badge>
                        ),
                      },
                      { label: t('aiadm.howSet'), value: AI_ACCESS[detail.builderAccess] },
                      {
                        label: t('aiadm.roleGroup'),
                        value: [
                          detail.roleAllows ? t('aiadm.roleHasUse') : t('aiadm.roleNoUse'),
                          detail.roleAllowsBuilder
                            ? t('aiadm.roleHasBuilder')
                            : t('aiadm.roleNoBuilder'),
                        ].join(' · '),
                      },
                      { label: t('aiadm.col.models'), value: modelsText(detail) },
                      { label: t('aiadm.col.limit'), value: limitText(detail) },
                    ],
                  },
                  {
                    title: t('aiadm.usageOf', { v0: monthLabel(month) }),
                    items: [
                      {
                        label: t('aiadm.col.calls'),
                        value: t('aiadm.timesN', { v0: num(detail.calls) }),
                      },
                      {
                        label: t('aiadm.tokens'),
                        value: (() => {
                          const l = limitOf(detail);
                          return l
                            ? `${num(detail.tokens)} / ${num(l)} (${Math.round((detail.tokens / l) * 100)}%)`
                            : num(detail.tokens);
                        })(),
                      },
                      { label: t('aiadm.cost'), value: usd(detail.cost) },
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
        onRowClick={editMode ? undefined : (r) => open(String(r.id))}
        exportable
        exportFileName={t('aiadm.exportUsers', { v0: month })}
        toolbarActions={
          editMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(new Map());
                  setEditMode(false);
                }}
              >
                {t('aiadm.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={savingDraft}
                disabled={!draft.size}
                onClick={() => void saveDraft()}
              >
                {t('aiadm.save')}
                {draft.size ? t('aiadm.nPeople', { v0: draft.size }) : ''}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              {t('aiadm.edit')}
            </Button>
          )
        }
        filters={
          <>
            <FilterButton fields={filterFields} value={flt} onChange={setFlt} />
            <div className={styles.monthSelect}>
              <Select
                value={month}
                onValueChange={setMonth}
                options={MONTHS.map((m) => ({ value: m, label: monthLabel(m) }))}
                aria-label={t('aiadm.month')}
              />
            </div>
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
  const { t } = useTranslation();
  const toast = useToast();
  const [access, setAccess] = useState<AiAccess>(user.access);
  const [builderAccess, setBuilderAccess] = useState<AiAccess>(user.builderAccess);
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
          builderAccess,
          models: allModels ? [] : picked,
          monthlyTokenLimit: limitMode === 'company' ? null : limitNum,
        }),
      });
      toast({ type: 'success', title: t('aiadm.saved') });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('aiadm.saveFailed')) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('aiadm.accessTitle', { v0: user.name ?? user.loginId })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('aiadm.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!limitOk || !modelsOk}
            onClick={() => void save()}
          >
            {t('aiadm.save')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          {t('aiadm.aiUse')}
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
              ? t('aiadm.followUse', { v0: user.roleAllows ? t('aiadm.hasUse') : t('aiadm.noUse') })
              : access === 'ALLOW'
                ? t('aiadm.allowHint')
                : t('aiadm.blockHint')}
          </p>
        </div>
        <div className={styles.field}>
          {t('aiadm.col.builder')}
          <ChoiceChips
            value={builderAccess}
            onChange={(v) => setBuilderAccess(v as AiAccess)}
            options={(Object.keys(AI_ACCESS) as AiAccess[]).map((k) => ({
              value: k,
              label: AI_ACCESS[k],
            }))}
          />
          <p className={styles.hint}>
            {builderAccess === 'DEFAULT'
              ? t('aiadm.followBuilder', {
                  v0: user.roleAllowsBuilder ? t('aiadm.hasBuilder') : t('aiadm.noBuilder'),
                })
              : builderAccess === 'ALLOW'
                ? t('aiadm.allowBuilderHint')
                : t('aiadm.blockBuilderHint')}
          </p>
        </div>
        <div className={styles.field}>
          {t('aiadm.col.models')}
          <ChoiceChips
            value={allModels ? 'all' : 'pick'}
            onChange={(v) => setAllModels(v === 'all')}
            options={[
              { value: 'all', label: t('aiadm.allModels') },
              { value: 'pick', label: t('aiadm.pickModels') },
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
          {!modelsOk && <p className={styles.hint}>{t('aiadm.pickOneModel')}</p>}
        </div>
        <div className={styles.field}>
          {t('aiadm.col.limit')}
          <ChoiceChips
            value={limitMode}
            onChange={setLimitMode}
            options={[
              {
                value: 'company',
                label: t('aiadm.followCompany', {
                  v0: companyLimit == null ? t('aiadm.unlimited') : num(companyLimit),
                }),
              },
              { value: 'own', label: t('aiadm.customLimit') },
            ]}
          />
          {limitMode === 'own' && (
            <div className={styles.inline}>
              <Input
                className={styles.limitInput}
                inputMode="numeric"
                value={limit}
                placeholder={t('aiadm.limitPh')}
                onChange={(e) => setLimit(e.target.value.replace(/[^\d,]/g, ''))}
              />
              <span className={styles.muted}>{t('aiadm.perMonth')}</span>
            </div>
          )}
          <p className={styles.hint}>
            {t('aiadm.thisMonth')} {num(user.tokens)} {t('aiadm.usedNote1')}
            {t('aiadm.usedNote2')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ── 사용 기록 ──

function UsageLog({ userId, compact }: { userId?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(kstToday());
  /** 검색 옆 필터 — 기능은 서버에서 거르고, 모델·사용자·결과는 받은 목록에서 */
  const [flt, setFlt] = useState<FilterValues>({});
  const feature = (flt.feature as string | undefined) ?? 'ALL';
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
      .catch((e) => toast({ type: 'error', title: errText(e, t('aiadm.loadFailed')) }))
      .finally(() => setLoading(false));
  }, [from, to, feature, userId, toast]);

  const tableRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        at: when(r.createdAt),
        featureName: AI_FEATURES[r.feature] ?? r.feature,
        modelName: modelName(models, r.model),
        result: r.ok ? t('aiadm.ok') : t('aiadm.fail'),
        seconds: (r.durationMs / 1000).toFixed(1),
      })),
    [rows, models],
  );

  const logFilter: FilterField[] = [
    {
      key: 'feature',
      label: t('aiadm.flt.feature'),
      type: 'single',
      options: Object.entries(AI_FEATURES).map(([value, label]) => ({ value, label })),
    },
    {
      key: 'modelName',
      label: t('aiadm.flt.model'),
      type: 'multi',
      options: [...new Set(tableRows.map((r) => r.modelName))].map((v) => ({ value: v, label: v })),
    },
    ...(userId
      ? []
      : [
          {
            key: 'userName',
            label: t('aiadm.flt.user'),
            type: 'multi',
            options: [...new Set(tableRows.map((r) => r.userName).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, 'ko'))
              .map((v) => ({ value: v, label: v })),
          } as FilterField,
        ]),
    {
      key: 'ok',
      label: t('aiadm.flt.result'),
      type: 'single',
      options: [
        { value: 'true', label: t('aiadm.ok') },
        { value: 'false', label: t('aiadm.fail') },
      ],
    },
  ];

  const columns: Column[] = [
    { title: t('aiadm.col.at'), dataIndex: 'at', width: 170 },
    ...(userId ? [] : [{ title: t('aiadm.col.user'), dataIndex: 'userName', width: 110 }]),
    { title: t('aiadm.col.feature'), dataIndex: 'featureName', width: 140 },
    { title: t('aiadm.col.model'), dataIndex: 'modelName', minWidth: 140, flex: 1 },
    {
      title: t('aiadm.col.input'),
      dataIndex: 'inputTokens',
      width: 100,
      numeric: true,
      render: (r) => num(Number(r.inputTokens)),
    },
    {
      title: t('aiadm.col.output'),
      dataIndex: 'outputTokens',
      width: 100,
      numeric: true,
      render: (r) => num(Number(r.outputTokens)),
    },
    {
      title: t('aiadm.col.cacheRead'),
      dataIndex: 'cacheReadTokens',
      width: 110,
      numeric: true,
      render: (r) => num(Number(r.cacheReadTokens)),
    },
    {
      title: t('aiadm.col.cost'),
      dataIndex: 'cost',
      width: 100,
      numeric: true,
      render: (r) => usd(r.cost as number | null),
    },
    { title: t('aiadm.col.seconds'), dataIndex: 'seconds', width: 110, numeric: true },
    {
      title: t('aiadm.col.result'),
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
            : t('aiadm.logNotFound')
        }
        backLabel={t('aiadm.tab.logs')}
        onBack={close}
        sections={
          detail
            ? [
                {
                  title: t('aiadm.col.calls'),
                  items: [
                    { label: t('aiadm.col.user'), value: detail.userName },
                    {
                      label: t('aiadm.col.feature'),
                      value: AI_FEATURES[detail.feature] ?? detail.feature,
                    },
                    { label: t('aiadm.col.model'), value: modelName(models, detail.model) },
                    {
                      label: t('aiadm.col.result'),
                      value: detail.ok ? t('aiadm.ok') : t('aiadm.fail'),
                    },
                    {
                      label: t('aiadm.duration'),
                      value: t('aiadm.secondsN', { v0: (detail.durationMs / 1000).toFixed(1) }),
                    },
                    { label: t('aiadm.runId'), value: detail.refId },
                  ],
                },
                {
                  title: t('aiadm.col.tokens'),
                  items: [
                    { label: t('aiadm.col.input'), value: num(detail.inputTokens) },
                    { label: t('aiadm.col.output'), value: num(detail.outputTokens) },
                    { label: t('aiadm.cacheWrite'), value: num(detail.cacheWriteTokens) },
                    { label: t('aiadm.col.cacheRead'), value: num(detail.cacheReadTokens) },
                    { label: t('aiadm.countedTokens'), value: num(detail.tokens) },
                    { label: t('aiadm.cost'), value: usd(detail.cost) },
                  ],
                },
                ...(detail.error
                  ? [
                      {
                        title: t('aiadm.error'),
                        items: [{ label: t('aiadm.content'), value: detail.error, wide: true }],
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    );
  }

  return (
    <div className={styles.stack}>
      {truncated && <p className={styles.notice}>{t('aiadm.tooMany')}</p>}
      <DataTable
        columns={columns}
        rows={
          filterRows(
            tableRows,
            logFilter.filter((f) => f.key !== 'feature'),
            flt,
            (r, key) => (key === 'ok' ? String(r.ok) : r[key as keyof typeof r]),
          ) as unknown as Row[]
        }
        loading={loading}
        onRowClick={compact ? undefined : (r) => open(String(r.id))}
        exportable
        exportFileName={t('aiadm.exportLogs', { v0: from, v1: to })}
        filters={
          <>
            <FilterButton fields={logFilter} value={flt} onChange={setFlt} />
            <DatePicker
              className={styles.dateInput}
              value={from}
              max={to}
              aria-label={t('aiadm.from')}
              onChange={(v) => v && setFrom(v)}
            />
            <span className={styles.muted}>~</span>
            <DatePicker
              className={styles.dateInput}
              value={to}
              min={from}
              aria-label={t('aiadm.to')}
              onChange={(v) => v && setTo(v)}
            />
          </>
        }
      />
    </div>
  );
}

// ── 모델 설정 ──

function SettingsForm({ data, onSaved }: { data: SettingsRes; onSaved: (s: SettingsRes) => void }) {
  const { t } = useTranslation();
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
  const [fetching, setFetching] = useState(false);

  const chatModels = data.models.filter((m) => m.chat && allowed.includes(m.id));
  // Claude에서 지금 쓸 수 있는 모델 목록을 다시 받는다(새 모델은 켜야 쓰임)
  const refreshModels = async () => {
    setFetching(true);
    try {
      const res = await api<SettingsRes>('/ai-admin/models/refresh', {
        method: 'POST',
        body: '{}',
      });
      const added = res.models.filter((m) => !data.models.some((x) => x.id === m.id)).length;
      toast({
        type: 'success',
        title: t('aiadm.fetched', {
          v0: res.models.length,
          v1: added ? t('aiadm.newModels', { v0: added }) : '',
        }),
      });
      onSaved(res);
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('aiadm.fetchFailed')) });
    } finally {
      setFetching(false);
    }
  };
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
      toast({ type: 'success', title: t('aiadm.saved') });
      onSaved(res);
    } catch (e) {
      toast({ type: 'error', title: errText(e, t('aiadm.saveFailed')) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.form}>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{t('aiadm.enabledModels')}</h3>
          <span className={styles.muted}>
            {data.catalog.live
              ? t('aiadm.fromClaude', {
                  v0: data.catalog.fetchedAt ? when(data.catalog.fetchedAt) : '',
                })
              : t('aiadm.defaultList')}
          </span>
          <Button
            variant="outline"
            size="sm"
            loading={fetching}
            disabled={!data.configured}
            onClick={() => void refreshModels()}
          >
            {t('aiadm.refetch')}
          </Button>
        </div>
        <p className={styles.hint}>
          {t('aiadm.modelsHelp1')}
          {t('aiadm.modelsHelp2')}
          {t('aiadm.modelsHelp3')}
          {t('aiadm.modelsHelp4')}
        </p>
        <div className={`${styles.modelRow} ${styles.modelHead}`}>
          <span>{t('aiadm.col.model')}</span>
          <span>{t('aiadm.inPrice')}</span>
          <span>{t('aiadm.outPrice')}</span>
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
                {m.hint || (m.chat ? t('aiadm.use.chat') : t('aiadm.use.light'))}
              </span>
              {m.lifecycle === 'deprecated' && (
                <Badge variant="subtle" color="warning" size="sm">
                  {t('aiadm.retiring')}
                </Badge>
              )}
            </div>
            <Input
              inputMode="decimal"
              value={prices[m.id]?.input ?? ''}
              placeholder={t('aiadm.empty')}
              aria-label={t('aiadm.inPriceOf', { v0: m.label })}
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
              placeholder={t('aiadm.empty')}
              aria-label={t('aiadm.outPriceOf', { v0: m.label })}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  [m.id]: { ...p[m.id], output: e.target.value.replace(/[^\d.]/g, '') },
                }))
              }
            />
          </div>
        ))}
        {!allowed.length && <p className={styles.hint}>{t('aiadm.needOneModel')}</p>}
        {priceBad && <p className={styles.hint}>{t('aiadm.pricePair')}</p>}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('aiadm.defaultModel')}</h3>
        <p className={styles.hint}>{t('aiadm.defaultModelHint')}</p>
        <ChoiceChips
          value={def}
          onChange={setDef}
          options={chatModels.map((m) => ({ value: m.id, label: m.label }))}
        />
        {!defOk && <p className={styles.hint}>{t('aiadm.pickDefault')}</p>}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('aiadm.defaultLimit')}</h3>
        <p className={styles.hint}>
          {t('aiadm.defaultLimitHint1')}
          {t('aiadm.defaultLimitHint2')}
        </p>
        <ChoiceChips
          value={limitMode}
          onChange={setLimitMode}
          options={[
            { value: 'none', label: t('aiadm.unlimited') },
            { value: 'limit', label: t('aiadm.setLimit') },
          ]}
        />
        {limitMode === 'limit' && (
          <div className={styles.inline}>
            <Input
              className={styles.limitInput}
              inputMode="numeric"
              value={limit}
              placeholder={t('aiadm.limitPh2')}
              onChange={(e) => setLimit(e.target.value.replace(/[^\d,]/g, ''))}
            />
            <span className={styles.muted}>{t('aiadm.perPersonMonth')}</span>
          </div>
        )}
      </section>

      <div className={styles.actions}>
        {data.setting.updatedAt && (
          <span className={styles.muted} style={{ marginRight: 'auto' }}>
            {t('aiadm.lastSaved')} {when(data.setting.updatedAt)}
          </span>
        )}
        <Button
          variant="primary"
          loading={busy}
          disabled={!allowed.length || !defOk || !limitOk || priceBad}
          onClick={() => void save()}
        >
          {t('aiadm.save')}
        </Button>
      </div>
    </div>
  );
}
