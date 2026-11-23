import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtDate } from '../lib/dateFormat';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { defaultDashLayout } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { openDashboardEditor, useDashEditorMessages } from '../lib/dashboardWindow';
import { useAuth } from '../auth/AuthContext';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  PageHeader,
  ListToolbar,
  SegmentedControl,
  Select,
  TableSkeleton,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { LayoutThumb, type ThumbItem } from '../components/dashboard/builder/LayoutThumb';
import styles from '../components/dashboard/builder/builder.module.css';
import { fs } from '../lib/fontScale';
import { WidgetList } from './WidgetStudio';

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  allowPersonal: boolean;
  /** 차트 색(통인·애플 색) */
  color?: string;
  widgetCount: number;
  preview: ThumbItem[];
  roles: { id: string; name: string }[];
  users: { id: string; name: string }[];
  updatedAt: string;
}

type View = 'card' | 'list';
const VIEW_KEY = 'tongin_dash_admin_view';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'card';
  } catch {
    return 'card';
  }
};

/** 지정 대상 배지 */
/** 지정 대상 배지 — max: 직원 이름을 몇 명까지 보일지(목록 한 줄에는 적게) */
function Targets({ t, max = 3 }: { t: TemplateRow; max?: number }) {
  if (!t.roles.length && !t.users.length) {
    return (
      <span style={{ fontSize: fs(12), color: 'var(--ark-color-text-tertiary)' }}>
        {t.isDefault ? i18n.t('dash.everyoneElse') : i18n.t('dash.noTarget')}
      </span>
    );
  }
  return (
    <>
      {t.roles.map((x) => (
        <Badge key={x.id} variant="subtle" color="info" size="sm">
          {x.name}
        </Badge>
      ))}
      {t.users.slice(0, max).map((x) => (
        <Badge key={x.id} variant="subtle" color="neutral" size="sm">
          {x.name}
        </Badge>
      ))}
      {t.users.length > max && (
        <Badge variant="subtle" color="neutral" size="sm">
          +{t.users.length - max}
          {i18n.t('dash.peopleSuffix')}
        </Badge>
      )}
    </>
  );
}

/**
 * 대시보드 관리 — 템플릿을 카드(기본)·목록으로 보고, 만들고, 권한 그룹·사용자에게 지정한다.
 * 카드에는 실제 구성을 추상화한 그림이 보인다.
 */
export default function DashboardAdmin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useAuth();
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [view, setView] = useState<View>(readView);
  const [open, setOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();
  // 대시보드(템플릿) / 위젯(만든 위젯) — 주소 ?tab=widgets로 기억(스튜디오에서 돌아올 때 위젯 탭으로)
  const [params, setParams] = useSearchParams();
  const tab: 'dashboards' | 'widgets' = params.get('tab') === 'widgets' ? 'widgets' : 'dashboards';
  const setTab = (v: string) =>
    setParams(v === 'widgets' ? { tab: 'widgets' } : {}, { replace: true });
  const [widgetReload, setWidgetReload] = useState(0);

  const load = useCallback(async () => {
    try {
      setRows(await api<TemplateRow[]>('/dashboards/templates'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.loadFailed') });
      setRows([]);
    }
  }, [toast, touch]);

  useEffect(() => {
    void load();
  }, [load]);

  // 위젯 배치는 새 창(전체 화면)에서 — 거기서 저장하면 목록을 새로 불러오고, '저장하고 다음'이면 설정으로
  const editLayout = (id: string) => {
    const path = `/dashboard-admin/${id}`;
    if (!openDashboardEditor(path, id)) navigate(path);
  };
  useDashEditorMessages((m) => {
    if (m.type === 'next') navigate(`/dashboard-admin/${m.id}/settings`);
    if (m.type === 'next' || (m.type === 'saved' && m.scope === 'template')) void load();
  });

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 저장이 막힌 브라우저 — 이번 화면에서만 바뀐다
    }
  };

  const remove = async (r: TemplateRow) => {
    if (!window.confirm(t('dash.deleteQ', { v0: r.name }))) return;
    try {
      await api(`/dashboards/templates/${r.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('dash.deleted') });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.deleteFailed') });
    }
  };

  const canCreate = can('DASHBOARD.CREATE');
  const canDelete = can('DASHBOARD.DELETE');
  const canUpdate = can('DASHBOARD.UPDATE');

  const columns: Column[] = [
    {
      title: t('dash.template'),
      dataIndex: 'name',
      minWidth: 250,
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 52, height: 32, flexShrink: 0 }}>
            <LayoutThumb
              items={(r as unknown as TemplateRow).preview}
              color={(r as unknown as TemplateRow).color}
            />
          </div>
          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(r.name)}
          </b>
          {r.isDefault ? (
            <Badge variant="subtle" color="primary" size="sm">
              {t('dash.defaultBadge')}
            </Badge>
          ) : null}
        </div>
      ),
    },
    // 설명은 따로 한 줄 칸으로(이름 아래 두 줄로 쌓지 않는다)
    { title: t('dash.desc'), dataIndex: 'description', flex: 1, minWidth: 200 },
    {
      title: t('dash.targets'),
      minWidth: 240,
      render: (r) => (
        // 한 줄로 — 권한 그룹 + 직원 1명 + '+N명'
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
          <Targets t={r as unknown as TemplateRow} max={1} />
        </div>
      ),
    },
    {
      title: t('dash.widgets'),
      width: 70,
      render: (r) => t('dash.countN', { v0: Number(r.widgetCount) }),
    },
    {
      title: t('dash.personalEdit'),
      width: 90,
      render: (r) => (r.allowPersonal ? t('dash.allowed') : t('dash.locked')),
    },
    {
      title: t('dash.updatedAt'),
      width: 110,
      render: (r) => fmtDate(r.updatedAt),
    },
  ];

  // 목록 화면 공통 배치 — 카드/목록(둘째 줄 오른쪽) · 새 템플릿(셋째 줄 오른쪽)
  const viewSwitch = (
    <SegmentedControl
      value={view}
      onChange={(v) => changeView(v as View)}
      options={[
        { value: 'card', label: t('dash.cards') },
        { value: 'list', label: t('dash.list') },
      ]}
    />
  );
  const createButton = canCreate ? (
    <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => setOpen(true)}>
      {t('dash.newTemplateBtn')}
    </Button>
  ) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('dash.manage')}
        subtitle={t('dash.manageSub')}
        onRefresh={tab === 'widgets' ? () => setWidgetReload((n) => n + 1) : load}
        updatedAt={tab === 'widgets' ? undefined : updatedAt}
      />
      <div>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'dashboards', label: t('dash.tab.dashboards') },
            { value: 'widgets', label: t('dash.tab.widgets') },
          ]}
        />
      </div>

      {tab === 'widgets' ? (
        <WidgetList reloadKey={widgetReload} view={view} viewSwitch={viewSwitch} />
      ) : rows === null ? (
        <TableSkeleton rows={4} cols={4} />
      ) : view === 'list' ? (
        // 목록은 보기만 — 행을 누르면 위젯 배치(상세), 설정·삭제는 그 머리글에
        <DataTable
          columns={columns}
          rows={rows as unknown as Row[]}
          onRowClick={(r) => editLayout(String(r.id))}
          viewSwitch={viewSwitch}
          toolbarActions={createButton}
        />
      ) : (
        <>
          <ListToolbar viewSwitch={viewSwitch} actions={createButton} />
          <div className={styles.cardGrid}>
            {rows.map((tpl) => (
              <article
                key={tpl.id}
                className={styles.tplCard}
                onClick={() => editLayout(tpl.id)}
                aria-label={tpl.name}
              >
                <div className={styles.tplPreview}>
                  <LayoutThumb items={tpl.preview} color={tpl.color} />
                </div>
                <div className={styles.tplBody}>
                  <span className={styles.tplName}>
                    {tpl.name}
                    {tpl.isDefault && (
                      <Badge variant="subtle" color="primary" size="sm">
                        {t('dash.defaultBadge')}
                      </Badge>
                    )}
                    {!tpl.allowPersonal && (
                      <Badge variant="subtle" color="neutral" size="sm">
                        {t('dash.locked')}
                      </Badge>
                    )}
                  </span>
                  <span className={styles.tplDesc}>{tpl.description || t('dash.noDesc')}</span>
                  <div className={styles.tplTags}>
                    <Targets t={tpl} />
                  </div>
                  <div className={styles.tplFoot} onClick={(e) => e.stopPropagation()}>
                    {t('dash.widgets')} {tpl.widgetCount}
                    {t('dash.countSep')} {fmtDate(tpl.updatedAt)}
                    <span className={styles.spacer} />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title={t('dash.editWidgets')}
                      aria-label={t('dash.editWidgetsOf', { v0: tpl.name })}
                      onClick={() => editLayout(tpl.id)}
                    >
                      <Pencil size={14} />
                    </button>
                    {canUpdate && (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title={t('dash.nameTargets')}
                        aria-label={t('dash.settingsOf', { v0: tpl.name })}
                        onClick={() => navigate(`/dashboard-admin/${tpl.id}/settings`)}
                      >
                        <Settings2 size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title={t('dash.delete')}
                        aria-label={t('dash.deleteOf', { v0: tpl.name })}
                        onClick={() => void remove(tpl)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {canCreate && (
              <button type="button" className={styles.newCard} onClick={() => setOpen(true)}>
                <Plus size={22} />
                {t('dash.createTemplate')}
              </button>
            )}
          </div>
        </>
      )}

      {open && (
        <CreateModal
          templates={rows ?? []}
          permissions={user?.permissions ?? []}
          isFirst={!rows?.length}
          onClose={() => setOpen(false)}
          onCreated={(id) => editLayout(id)}
        />
      )}
    </div>
  );
}

type Start = 'blank' | 'default' | 'copy';

/** 새 템플릿 — 이름 + 시작 구성(빈 화면 / 기본 구성 / 다른 템플릿 가져오기) */
function CreateModal({
  templates,
  permissions,
  isFirst,
  onClose,
  onCreated,
}: {
  templates: TemplateRow[];
  permissions: string[];
  isFirst: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Start>('default');
  const [copyFrom, setCopyFrom] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const defaultItems = useMemo(() => defaultDashLayout(permissions).items, [permissions]);
  const picked = templates.find((t) => t.id === copyFrom);

  const options: { key: Start; title: string; desc: string; items: ThumbItem[] }[] = [
    { key: 'blank', title: t('dash.start.blank'), desc: t('dash.start.blankDesc'), items: [] },
    {
      key: 'default',
      title: t('dash.src.preset'),
      desc: t('dash.start.presetDesc'),
      items: defaultItems,
    },
    {
      key: 'copy',
      title: t('dash.start.copy'),
      desc: t('dash.start.copyDesc'),
      items: picked?.preview ?? templates[0]?.preview ?? [],
    },
  ];

  const create = async () => {
    if (!name.trim()) {
      toast({ type: 'warning', title: t('dash.nameReq') });
      return;
    }
    if (start === 'copy' && !copyFrom) {
      toast({ type: 'warning', title: t('dash.pickTemplateReq') });
      return;
    }
    setBusy(true);
    try {
      const layout =
        start === 'copy'
          ? (await api<{ layout: unknown }>(`/dashboards/templates/${copyFrom}`)).layout
          : start === 'blank'
            ? { version: 1, items: [] }
            : undefined;
      const d = await api<{ id: string }>('/dashboards/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          ...(layout ? { layout } : {}),
          isDefault: isFirst,
        }),
      });
      onCreated(d.id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('dash.createFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('dash.newTemplate')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('dash.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void create()}
          >
            {t('dash.createAndPlace')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className={styles.sizeRow} style={{ gap: 12 }}>
          <Input
            label={t('dash.nameLabel')}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('dash.namePh')}
          />
          <Input
            label={t('dash.desc')}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('dash.descPh')}
          />
        </div>
        <div className={styles.field}>
          {t('dash.startLayout')}
          <div className={styles.startOpts} role="radiogroup" aria-label={t('dash.startLayout')}>
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={start === o.key}
                className={`${styles.startOpt} ${start === o.key ? styles.startOptOn : ''}`}
                onClick={() => setStart(o.key)}
                disabled={o.key === 'copy' && templates.length === 0}
              >
                <div className={styles.startOptThumb}>
                  <LayoutThumb items={o.items} />
                </div>
                <b>{o.title}</b>
                <span>
                  {o.key === 'copy' && templates.length === 0 ? t('dash.noTemplates') : o.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
        {start === 'copy' && (
          <Select
            label={t('dash.copyFrom')}
            value={copyFrom || undefined}
            placeholder={t('dash.pickTemplate')}
            onValueChange={setCopyFrom}
            options={templates.map((tpl) => ({
              value: tpl.id,
              label: t('dash.templateOpt', { v0: tpl.name, v1: tpl.widgetCount }),
            }))}
          />
        )}
      </div>
    </Modal>
  );
}
