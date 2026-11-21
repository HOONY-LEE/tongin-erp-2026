import i18n from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { filterQuery, LIST_LIMIT } from '../lib/serverFilter';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { shortDate, useWorkDirectory, type OrgRef } from '../lib/workMenus';
import {
  Button,
  Checkbox,
  DataTable,
  FilterButton,
  Input,
  ListPage,
  Modal,
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  Textarea,
  useToast,
  type Column,
  type FilterField,
  type FilterValues,
  type Row,
  type StatusMap,
} from '../components/ui';
import styles from './work.module.css';

interface Notice {
  id: string;
  title: string;
  body: string;
  audience: 'ALL' | 'ORG';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; orgUnitName: string | null } | null;
  orgUnits: OrgRef[];
}

const AUDIENCE: StatusMap = {
  ALL: { label: i18n.t('notice.scope.ALL'), color: 'primary' },
  ORG: { label: i18n.t('notice.scope.ORG'), color: 'info' },
};
const NEW_MAP: StatusMap = { NEW: { label: i18n.t('notice.new'), color: 'warning' } };
/** 며칠 안에 올라온 공지를 '새 글'로 */
const NEW_DAYS = 3;
const isNew = (n: Notice) => Date.now() - Date.parse(n.createdAt) < NEW_DAYS * 86_400_000;
const target = (n: Notice) =>
  n.audience === 'ALL' ? i18n.t('notice.scope.ALL') : n.orgUnits.map((o) => o.name).join(', ');

type Filter = 'all' | 'ALL' | 'ORG';

/**
 * 공지사항 — 전사·팀 공지. 전사 공지와 내 소속(상위 포함) 조직 공지는 직원 계정이면 누구나 본다.
 * 작성·수정·삭제는 NOTICE.CREATE/UPDATE/DELETE.
 */
export default function Notices() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  /** 검색 옆 필터 — 작성일·작성자·대상 조직·고정 */
  const [flt, setFlt] = useState<FilterValues>({});
  /** 검색칸 — 서버에서 찾는다(제목·본문) */
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Notice | 'new' | null>(null);
  /** 작성자·대상 조직 고르기 목록 — 거른 결과로 줄어들지 않게 본 적 있는 것을 모아 둔다 */
  const [seen, setSeen] = useState<{ author: Map<string, string>; org: Map<string, string> }>(
    () => ({ author: new Map(), org: new Map() }),
  );
  const query = filterQuery(flt, q);

  // 필터·검색은 서버에서 — 늦게 온 앞선 응답이 최근 결과를 덮지 않게
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const data = await api<Notice[]>(`/notices${query}`);
      if (my !== seq.current) return;
      setRows(data);
      setSeen((prev) => {
        const author = new Map(prev.author);
        const org = new Map(prev.org);
        for (const n of data) {
          if (n.author) author.set(n.author.id, n.author.name);
          for (const o of n.orgUnits) org.set(o.id, o.name);
        }
        return author.size === prev.author.size && org.size === prev.org.size
          ? prev
          : { author, org };
      });
      touch();
    } catch (e) {
      if (my === seq.current)
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [toast, t, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const remove = async (n: Notice) => {
    if (!window.confirm(t('notice.deleteQ', { v0: n.title }))) return;
    try {
      await api(`/notices/${n.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('notice.deleted') });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('notice.deleteFailed') });
    }
  };

  const editor = editing && (
    <NoticeEditor
      notice={editing === 'new' ? null : editing}
      onClose={() => setEditing(null)}
      onSaved={(n) => {
        setEditing(null);
        void load();
        detail.open(n.id);
      }}
    />
  );

  if (detail.id) {
    const d = rows.find((r) => r.id === detail.id);
    return (
      <>
        <RecordDetail
          loading={!d && loading}
          title={d ? d.title : t('notice.notFound')}
          backLabel={t('nav.notices')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('NOTICE.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    {t('notice.delete')}
                  </Button>
                )}
                {can('NOTICE.UPDATE') && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(d)}>
                    {t('notice.edit')}
                  </Button>
                )}
              </>
            ) : undefined
          }
          sections={
            d
              ? [
                  {
                    items: [
                      {
                        label: t('notice.kind'),
                        value: <StatusBadge value={d.audience} map={AUDIENCE} />,
                      },
                      { label: t('notice.target'), value: target(d) },
                      {
                        label: t('notice.author'),
                        value: d.author
                          ? [d.author.name, d.author.orgUnitName].filter(Boolean).join(' · ')
                          : null,
                      },
                      { label: t('notice.createdAt'), value: shortDate(d.createdAt) },
                      { label: t('notice.pinned'), value: d.pinned ? t('notice.pin') : null },
                    ],
                  },
                  {
                    title: t('notice.content'),
                    items: [
                      {
                        label: t('notice.body'),
                        value: <p className={styles.body}>{d.body}</p>,
                        wide: true,
                      },
                    ],
                  },
                ]
              : []
          }
        />
        {editor}
      </>
    );
  }

  const sorted = (m: Map<string, string>) =>
    [...m]
      .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
      .map(([value, label]) => ({ value, label }));
  const filterFields: FilterField[] = [
    { key: 'createdAt', label: t('notice.flt.createdAt'), type: 'date' },
    {
      key: 'authorEmpId',
      label: t('notice.flt.author'),
      type: 'multi',
      options: sorted(seen.author),
    },
    {
      key: 'orgUnitId',
      label: t('notice.flt.org'),
      type: 'multi',
      options: sorted(seen.org),
    },
    {
      key: 'pinned',
      label: t('notice.flt.pinned'),
      type: 'single',
      options: [
        { value: 'true', label: t('notice.flt.yes') },
        { value: 'false', label: t('notice.flt.no') },
      ],
    },
  ];
  // 필터·검색은 서버가 걸어 보낸다 — 전체/전사/팀 탭 숫자도 걸린 목록 기준
  const picked = rows;
  const filtered = filter === 'all' ? picked : picked.filter((r) => r.audience === filter);
  const count = (f: Filter) =>
    f === 'all' ? picked.length : picked.filter((r) => r.audience === f).length;

  const columns: Column[] = [
    {
      title: t('notice.kind'),
      width: 80,
      render: (r) => <StatusBadge value={String(r.audience)} map={AUDIENCE} />,
    },
    {
      title: t('notice.title'),
      dataIndex: 'title',
      flex: 1,
      minWidth: 260,
      render: (r) => {
        const n = r as unknown as Notice;
        return (
          <span className={styles.titleCell}>
            {n.pinned && <Pin size={14} className={styles.pin} aria-label={t('notice.pinned')} />}
            <span>{n.title}</span>
            {isNew(n) && <StatusBadge value="NEW" map={NEW_MAP} />}
          </span>
        );
      },
      exportValue: (r) => String(r.title),
    },
    { title: t('notice.target'), minWidth: 160, render: (r) => target(r as unknown as Notice) },
    {
      title: t('notice.author'),
      width: 110,
      render: (r) => (r as unknown as Notice).author?.name ?? '-',
    },
    { title: t('notice.createdAt'), width: 130, render: (r) => shortDate(r.createdAt) },
  ];

  return (
    <ListPage title={t('nav.notices')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        filters={
          <FilterButton
            fields={filterFields}
            value={flt}
            onChange={setFlt}
            limited={rows.length >= LIST_LIMIT}
          />
        }
        onSearch={setQ}
        columns={columns}
        rows={filtered as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => detail.open(String(r.id))}
        tabs={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'all', label: t('notice.allN', { v0: count('all') }) },
              { value: 'ALL', label: t('notice.companyN', { v0: count('ALL') }) },
              { value: 'ORG', label: t('notice.teamN', { v0: count('ORG') }) },
            ]}
          />
        }
        toolbarActions={
          can('NOTICE.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              {t('notice.writeBtn')}
            </Button>
          ) : undefined
        }
      />
      {editor}
    </ListPage>
  );
}

/** 공지 작성·수정 — 제목·대상·본문은 필수(조직 공지면 조직을 하나 이상) */
function NoticeEditor({
  notice,
  onClose,
  onSaved,
}: {
  notice: Notice | null;
  onClose: () => void;
  onSaved: (n: Notice) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { audienceOrgs } = useWorkDirectory();
  const [title, setTitle] = useState(notice?.title ?? '');
  const [body, setBody] = useState(notice?.body ?? '');
  const [audience, setAudience] = useState<'ALL' | 'ORG'>(notice?.audience ?? 'ALL');
  const [orgIds, setOrgIds] = useState<Set<string>>(
    () => new Set(notice?.orgUnits.map((o) => o.id) ?? []),
  );
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [busy, setBusy] = useState(false);

  const ready = useMemo(
    () => !!title.trim() && !!body.trim() && (audience === 'ALL' || orgIds.size > 0),
    [title, body, audience, orgIds],
  );

  const toggle = (id: string, on: boolean) =>
    setOrgIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        body,
        audience,
        orgUnitIds: audience === 'ORG' ? [...orgIds] : [],
        pinned,
      };
      const saved = await api<Notice>(notice ? `/notices/${notice.id}` : '/notices', {
        method: notice ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      toast({ type: 'success', title: notice ? t('notice.updated') : t('notice.posted') });
      onSaved(saved);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('notice.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={notice ? t('notice.editTitle') : t('notice.writeTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('notice.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void save()}>
            {notice ? t('notice.save') : t('notice.post')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.label}>
          <span>
            {t('notice.title')} <span className={styles.req}>*</span>
          </span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <div className={styles.label}>
          <span>
            {t('notice.target')} <span className={styles.req}>*</span>
          </span>
          <SegmentedControl
            value={audience}
            onChange={(v) => setAudience(v as 'ALL' | 'ORG')}
            options={[
              { value: 'ALL', label: t('notice.scope.ALL') },
              { value: 'ORG', label: t('notice.pickOrg') },
            ]}
          />
          {audience === 'ORG' && (
            <>
              <div className={styles.orgGrid}>
                {audienceOrgs.map((o) => (
                  <Checkbox
                    key={o.id}
                    label={o.name}
                    checked={orgIds.has(o.id)}
                    onCheckedChange={(c) => toggle(o.id, c === true)}
                  />
                ))}
              </div>
              <span className={styles.hint}>{t('notice.orgHint')}</span>
            </>
          )}
        </div>
        <label className={styles.label}>
          <span>
            {t('notice.body')} <span className={styles.req}>*</span>
          </span>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
        </label>
        <Checkbox
          label={t('notice.pinTop')}
          checked={pinned}
          onCheckedChange={(c) => setPinned(c === true)}
        />
      </div>
    </Modal>
  );
}
