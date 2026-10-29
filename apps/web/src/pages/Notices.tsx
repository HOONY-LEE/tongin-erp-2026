import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import { shortDate, useWorkDirectory, type OrgRef } from '../lib/workMenus';
import {
  Button,
  Checkbox,
  DataTable,
  Input,
  ListPage,
  Modal,
  RecordDetail,
  SegmentedControl,
  StatusBadge,
  Textarea,
  useToast,
  type Column,
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
  ALL: { label: '전사', color: 'primary' },
  ORG: { label: '팀', color: 'info' },
};
const NEW_MAP: StatusMap = { NEW: { label: '새 글', color: 'warning' } };
/** 며칠 안에 올라온 공지를 '새 글'로 */
const NEW_DAYS = 3;
const isNew = (n: Notice) => Date.now() - Date.parse(n.createdAt) < NEW_DAYS * 86_400_000;
const target = (n: Notice) =>
  n.audience === 'ALL' ? '전사' : n.orgUnits.map((o) => o.name).join(', ');

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
  const [editing, setEditing] = useState<Notice | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Notice[]>('/notices'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('common.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (n: Notice) => {
    if (!window.confirm(`'${n.title}' 공지를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/notices/${n.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '삭제했습니다' });
      detail.close();
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '삭제하지 못했습니다' });
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
          title={d ? d.title : '찾을 수 없습니다'}
          backLabel={t('nav.notices')}
          onBack={detail.close}
          actions={
            d ? (
              <>
                {can('NOTICE.DELETE') && (
                  <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                    삭제
                  </Button>
                )}
                {can('NOTICE.UPDATE') && (
                  <Button variant="primary" size="sm" onClick={() => setEditing(d)}>
                    수정
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
                        label: '구분',
                        value: <StatusBadge value={d.audience} map={AUDIENCE} />,
                      },
                      { label: '대상', value: target(d) },
                      {
                        label: '작성자',
                        value: d.author
                          ? [d.author.name, d.author.orgUnitName].filter(Boolean).join(' · ')
                          : null,
                      },
                      { label: '작성일', value: shortDate(d.createdAt) },
                      { label: '상단 고정', value: d.pinned ? '고정' : null },
                    ],
                  },
                  {
                    title: '내용',
                    items: [
                      {
                        label: '본문',
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

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.audience === filter);
  const count = (f: Filter) =>
    f === 'all' ? rows.length : rows.filter((r) => r.audience === f).length;

  const columns: Column[] = [
    {
      title: '구분',
      width: 80,
      render: (r) => <StatusBadge value={String(r.audience)} map={AUDIENCE} />,
    },
    {
      title: '제목',
      dataIndex: 'title',
      flex: 1,
      minWidth: 260,
      render: (r) => {
        const n = r as unknown as Notice;
        return (
          <span className={styles.titleCell}>
            {n.pinned && <Pin size={14} className={styles.pin} aria-label="상단 고정" />}
            <span>{n.title}</span>
            {isNew(n) && <StatusBadge value="NEW" map={NEW_MAP} />}
          </span>
        );
      },
      exportValue: (r) => String(r.title),
    },
    { title: '대상', minWidth: 160, render: (r) => target(r as unknown as Notice) },
    {
      title: '작성자',
      width: 110,
      render: (r) => (r as unknown as Notice).author?.name ?? '-',
    },
    { title: '작성일', width: 130, render: (r) => shortDate(r.createdAt) },
  ];

  return (
    <ListPage title={t('nav.notices')} onRefresh={load} updatedAt={updatedAt}>
      <DataTable
        columns={columns}
        rows={filtered as unknown as Row[]}
        loading={loading}
        onRowClick={(r) => detail.open(String(r.id))}
        filters={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'all', label: `전체 ${count('all')}` },
              { value: 'ALL', label: `전사 ${count('ALL')}` },
              { value: 'ORG', label: `팀 공지 ${count('ORG')}` },
            ]}
          />
        }
        toolbarActions={
          can('NOTICE.CREATE') ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              + 공지 작성
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
      toast({ type: 'success', title: notice ? '수정했습니다' : '공지를 올렸습니다' });
      onSaved(saved);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={notice ? '공지 수정' : '공지 작성'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void save()}>
            {notice ? '저장' : '올리기'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.label}>
          <span>
            제목 <span className={styles.req}>*</span>
          </span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <div className={styles.label}>
          <span>
            대상 <span className={styles.req}>*</span>
          </span>
          <SegmentedControl
            value={audience}
            onChange={(v) => setAudience(v as 'ALL' | 'ORG')}
            options={[
              { value: 'ALL', label: '전사' },
              { value: 'ORG', label: '조직 지정' },
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
              <span className={styles.hint}>
                고른 조직과 그 아래 조직 사람이 봅니다(회사를 고르면 소속 지점까지).
              </span>
            </>
          )}
        </div>
        <label className={styles.label}>
          <span>
            본문 <span className={styles.req}>*</span>
          </span>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
        </label>
        <Checkbox
          label="목록 맨 위에 고정"
          checked={pinned}
          onCheckedChange={(c) => setPinned(c === true)}
        />
      </div>
    </Modal>
  );
}
