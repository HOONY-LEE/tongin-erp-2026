import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  SegmentedControl,
  Select,
  TableSkeleton,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { LayoutThumb, type ThumbItem } from '../components/dashboard/builder/LayoutThumb';
import styles from '../components/dashboard/builder/builder.module.css';

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
      <span style={{ fontSize: 12, color: 'var(--ark-color-text-tertiary)' }}>
        {t.isDefault ? '지정 없는 모든 사람' : '지정 없음'}
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
          +{t.users.length - max}명
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
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useAuth();
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [view, setView] = useState<View>(readView);
  const [open, setOpen] = useState(false);
  const { updatedAt, touch } = useUpdatedAt();

  const load = useCallback(async () => {
    try {
      setRows(await api<TemplateRow[]>('/dashboards/templates'));
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
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
    if (
      !window.confirm(`'${r.name}' 템플릿을 지울까요? 지정된 사람들은 기본 대시보드를 보게 됩니다.`)
    )
      return;
    try {
      await api(`/dashboards/templates/${r.id}`, { method: 'DELETE' });
      toast({ type: 'success', title: '지웠습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  const canCreate = can('DASHBOARD.CREATE');
  const canDelete = can('DASHBOARD.DELETE');
  const canUpdate = can('DASHBOARD.UPDATE');

  const columns: Column[] = [
    {
      title: '템플릿',
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
              기본
            </Badge>
          ) : null}
        </div>
      ),
    },
    // 설명은 따로 한 줄 칸으로(이름 아래 두 줄로 쌓지 않는다)
    { title: '설명', dataIndex: 'description', flex: 1, minWidth: 200 },
    {
      title: '지정 대상',
      minWidth: 240,
      render: (r) => (
        // 한 줄로 — 권한 그룹 + 직원 1명 + '+N명'
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
          <Targets t={r as unknown as TemplateRow} max={1} />
        </div>
      ),
    },
    { title: '위젯', width: 70, render: (r) => `${Number(r.widgetCount)}개` },
    { title: '개인 수정', width: 90, render: (r) => (r.allowPersonal ? '허용' : '잠금') },
    {
      title: '수정일',
      width: 110,
      render: (r) => new Date(String(r.updatedAt)).toLocaleDateString('ko-KR'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="대시보드 관리"
        subtitle="대시보드 템플릿을 만들어 권한 그룹이나 사용자에게 기본으로 보여 줍니다. 사람마다 볼 수 없는 데이터의 위젯은 자동으로 빠집니다."
        onRefresh={load}
        updatedAt={updatedAt}
        actions={
          canCreate ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setOpen(true)}
            >
              새 템플릿
            </Button>
          ) : undefined
        }
        footer={
          <SegmentedControl
            value={view}
            onChange={(v) => changeView(v as View)}
            options={[
              { value: 'card', label: '카드' },
              { value: 'list', label: '목록' },
            ]}
          />
        }
      />

      {rows === null ? (
        <TableSkeleton rows={4} cols={4} />
      ) : view === 'list' ? (
        // 목록은 보기만 — 행을 누르면 위젯 배치(상세), 설정·삭제는 그 머리글에
        <DataTable
          columns={columns}
          rows={rows as unknown as Row[]}
          onRowClick={(r) => editLayout(String(r.id))}
        />
      ) : (
        <div className={styles.cardGrid}>
          {rows.map((t) => (
            <article
              key={t.id}
              className={styles.tplCard}
              onClick={() => editLayout(t.id)}
              aria-label={t.name}
            >
              <div className={styles.tplPreview}>
                <LayoutThumb items={t.preview} color={t.color} />
              </div>
              <div className={styles.tplBody}>
                <span className={styles.tplName}>
                  {t.name}
                  {t.isDefault && (
                    <Badge variant="subtle" color="primary" size="sm">
                      기본
                    </Badge>
                  )}
                  {!t.allowPersonal && (
                    <Badge variant="subtle" color="neutral" size="sm">
                      잠금
                    </Badge>
                  )}
                </span>
                <span className={styles.tplDesc}>{t.description || '설명 없음'}</span>
                <div className={styles.tplTags}>
                  <Targets t={t} />
                </div>
                <div className={styles.tplFoot} onClick={(e) => e.stopPropagation()}>
                  위젯 {t.widgetCount}개 · {new Date(t.updatedAt).toLocaleDateString('ko-KR')}
                  <span className={styles.spacer} />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="위젯 편집"
                    aria-label={`${t.name} 위젯 편집`}
                    onClick={() => editLayout(t.id)}
                  >
                    <Pencil size={14} />
                  </button>
                  {canUpdate && (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="이름·지정 설정"
                      aria-label={`${t.name} 설정`}
                      onClick={() => navigate(`/dashboard-admin/${t.id}/settings`)}
                    >
                      <Settings2 size={14} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="삭제"
                      aria-label={`${t.name} 삭제`}
                      onClick={() => void remove(t)}
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
              <Plus size={22} />새 템플릿 만들기
            </button>
          )}
        </div>
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
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Start>('default');
  const [copyFrom, setCopyFrom] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const defaultItems = useMemo(() => defaultDashLayout(permissions).items, [permissions]);
  const picked = templates.find((t) => t.id === copyFrom);

  const options: { key: Start; title: string; desc: string; items: ThumbItem[] }[] = [
    { key: 'blank', title: '빈 화면에서 시작', desc: '위젯을 하나씩 직접 놓습니다', items: [] },
    {
      key: 'default',
      title: '기본 구성',
      desc: '자주 보는 지표로 미리 채웁니다',
      items: defaultItems,
    },
    {
      key: 'copy',
      title: '다른 템플릿 가져오기',
      desc: '있는 템플릿을 복사해 고칩니다',
      items: picked?.preview ?? templates[0]?.preview ?? [],
    },
  ];

  const create = async () => {
    if (!name.trim()) {
      toast({ type: 'warning', title: '이름을 입력해 주세요' });
      return;
    }
    if (start === 'copy' && !copyFrom) {
      toast({ type: 'warning', title: '가져올 템플릿을 골라 주세요' });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="새 대시보드 템플릿"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void create()}
          >
            만들고 위젯 놓기
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className={styles.sizeRow} style={{ gap: 12 }}>
          <Input
            label="이름 *"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 지점장용 대시보드"
          />
          <Input
            label="설명"
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="누가 무엇을 보는 대시보드인지"
          />
        </div>
        <div className={styles.field}>
          시작 구성
          <div className={styles.startOpts} role="radiogroup" aria-label="시작 구성">
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
                  {o.key === 'copy' && templates.length === 0 ? '아직 템플릿이 없습니다' : o.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
        {start === 'copy' && (
          <Select
            label="가져올 템플릿"
            value={copyFrom || undefined}
            placeholder="템플릿 고르기"
            onValueChange={setCopyFrom}
            options={templates.map((t) => ({
              value: t.id,
              label: `${t.name} · 위젯 ${t.widgetCount}개`,
            }))}
          />
        )}
      </div>
    </Modal>
  );
}
