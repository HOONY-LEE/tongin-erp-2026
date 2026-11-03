import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FileUp, RefreshCw, Search, Sparkles } from 'lucide-react';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_COLOR,
  KNOWLEDGE_CATEGORY_LABEL,
  KNOWLEDGE_CONCEPT_COLOR,
  KNOWLEDGE_CONCEPT_KINDS,
  KNOWLEDGE_CONCEPT_KIND_LABEL,
  type KnowledgeCategory,
  type KnowledgeConceptKind,
  type KnowledgeDocRow,
  type KnowledgeDocView,
  type KnowledgeGraph,
} from '@tongin/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { useDetailParam, useTabParam } from '../lib/useDetailParam';
import { useUpdatedAt } from '../lib/useUpdatedAt';
import {
  Badge,
  Button,
  DataTable,
  Input,
  ListPage,
  ListToolbar,
  Modal,
  RecordDetail,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
  type Column,
  type Row,
} from '../components/ui';
import { Markdown } from '../components/ai/Markdown';
import { KnowledgeGraphView } from '../components/knowledge/KnowledgeGraphView';
import styles from './knowledge.module.css';

type View = 'graph' | 'list';
interface ConceptView {
  id: string;
  name: string;
  kind: KnowledgeConceptKind;
  description: string | null;
  docs: { id: string; title: string; category: KnowledgeCategory }[];
  relations: { from: string; to: string; label: string }[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

function CategoryTag({ c }: { c: KnowledgeCategory }) {
  return (
    <span className={styles.tag}>
      <i style={{ background: KNOWLEDGE_CATEGORY_COLOR[c] }} />
      {KNOWLEDGE_CATEGORY_LABEL[c]}
    </span>
  );
}
function KindTag({ k }: { k: KnowledgeConceptKind }) {
  return (
    <span className={styles.tag}>
      <i style={{ background: KNOWLEDGE_CONCEPT_COLOR[k] }} />
      {KNOWLEDGE_CONCEPT_KIND_LABEL[k]}
    </span>
  );
}
function Status({ d }: { d: Pick<KnowledgeDocRow, 'analyzeStatus' | 'analyzeError'> }) {
  if (d.analyzeStatus === 'PENDING')
    return (
      <Badge variant="subtle" color="info" size="sm">
        AI 정리 중
      </Badge>
    );
  if (d.analyzeStatus === 'ERROR')
    return (
      <span title={d.analyzeError ?? undefined}>
        <Badge variant="subtle" color="error" size="sm">
          정리 실패
        </Badge>
      </span>
    );
  return (
    <Badge variant="subtle" color="success" size="sm">
      정리됨
    </Badge>
  );
}

/**
 * 지식베이스 — 회사 문서·지침·원칙. 올리거나 직접 쓰면 AI가 요약·키워드·개념(용어·규칙·역할·절차)과 관계를 뽑아
 * 온톨로지 그래프(옵시디언 그래프 뷰)로 보여 준다. AI 비서·에이전트는 일할 때 여기서 기준을 찾아 근거로 쓴다.
 */
export default function Knowledge() {
  const toast = useToast();
  const { can } = useAuth();
  const [docs, setDocs] = useState<KnowledgeDocRow[]>([]);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeDocView | 'new' | null>(null);
  const { tab: view, setTab: setView } = useTabParam<View>('graph', 'view');
  const detail = useDetailParam();
  const { updatedAt, touch } = useUpdatedAt();
  const canCreate = can('KNOWLEDGE.CREATE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, g] = await Promise.all([
        api<KnowledgeDocRow[]>('/knowledge/docs'),
        api<KnowledgeGraph>('/knowledge/graph'),
      ]);
      setDocs(d);
      setGraph(g);
      touch();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    } finally {
      setLoading(false);
    }
  }, [toast, touch]);
  useEffect(() => {
    void load();
  }, [load]);
  // AI가 정리하는 동안은 몇 초마다 다시 본다
  const pending = docs.some((d) => d.analyzeStatus === 'PENDING');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [pending, load]);

  const term = q.trim();
  const filtered = useMemo(
    () =>
      docs.filter(
        (d) => !term || [d.title, d.summary ?? '', ...d.keywords].some((x) => x.includes(term)),
      ),
    [docs, term],
  );

  const addButton = canCreate ? (
    <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
      + 문서 추가
    </Button>
  ) : undefined;
  const modal = (
    <DocModal
      editing={editing}
      onClose={() => setEditing(null)}
      onSaved={async (id) => {
        setEditing(null);
        await load();
        if (id && view === 'graph') setSelected(`d:${id}`);
      }}
    />
  );

  if (detail.id) {
    return (
      <>
        <DocDetail
          id={detail.id}
          onBack={detail.close}
          onEdit={(d) => setEditing(d)}
          onChanged={load}
          onOpen={detail.open}
        />
        {modal}
      </>
    );
  }

  const viewSwitch = (
    <SegmentedControl
      value={view}
      onChange={(v) => setView(v as View)}
      options={[
        { value: 'graph', label: '그래프' },
        { value: 'list', label: '문서 목록' },
      ]}
    />
  );
  const search = (
    <div className="sft-toolbar__search-wrap">
      <span className="sft-toolbar__search-icon" aria-hidden="true">
        <Search size={15} />
      </span>
      <input
        className="sft-toolbar__search"
        type="search"
        value={q}
        placeholder={view === 'graph' ? '문서·개념 찾기' : '제목·요약·키워드'}
        aria-label="지식 찾기"
        onChange={(e) => setQ(e.target.value)}
      />
    </div>
  );
  const columns: Column[] = [
    { title: '제목', dataIndex: 'title', flex: 1, minWidth: 180 },
    {
      title: '분류',
      width: 110,
      render: (r) => <CategoryTag c={r.category as KnowledgeCategory} />,
      exportValue: (r) => KNOWLEDGE_CATEGORY_LABEL[r.category as KnowledgeCategory],
    },
    {
      title: '요약',
      flex: 2,
      minWidth: 220,
      render: (r) => <span className={styles.clip}>{(r.summary as string) ?? '—'}</span>,
      exportValue: (r) => (r.summary as string) ?? '',
    },
    { title: '개념', width: 70, render: (r) => `${r.conceptCount as number}개` },
    {
      title: 'AI 정리',
      width: 90,
      render: (r) => <Status d={r as unknown as KnowledgeDocRow} />,
    },
    {
      title: '수정',
      width: 150,
      render: (r) => `${when(String(r.updatedAt))}`,
      exportValue: (r) => String(r.updatedAt),
    },
  ];

  const docCount = graph.nodes.filter((n) => n.type === 'doc').length;
  return (
    <ListPage
      fit
      title="지식베이스"
      subtitle="회사 지침·규정·원칙을 모아 두면 AI가 개념과 관계를 정리하고, AI 비서·에이전트가 일할 때 여기서 기준을 찾아 근거로 씁니다."
      onRefresh={load}
      updatedAt={updatedAt}
    >
      {view === 'list' ? (
        <DataTable
          fit
          columns={columns}
          rows={filtered as unknown as Row[]}
          loading={loading}
          exportable
          exportFileName="지식베이스"
          viewSwitch={viewSwitch}
          toolbarActions={addButton}
          onRowClick={(r) => detail.open(String(r.id))}
        />
      ) : (
        <div className={styles.graphPage}>
          <div className="dt-wrap">
            <ListToolbar search={search} viewSwitch={viewSwitch} actions={addButton} />
          </div>
          <div className={styles.graphBody}>
            <div className={styles.graphCard}>
              {graph.nodes.length ? (
                <KnowledgeGraphView
                  graph={graph}
                  query={q}
                  selected={selected}
                  onSelect={setSelected}
                />
              ) : (
                <div className={styles.empty}>
                  {loading
                    ? '불러오는 중…'
                    : '아직 문서가 없습니다. 회사 지침이나 규정을 올려 보세요.'}
                </div>
              )}
            </div>
            <aside className={styles.side}>
              {selected?.startsWith('d:') ? (
                <DocPeek
                  id={selected.slice(2)}
                  onOpen={() => detail.open(selected.slice(2))}
                  onSelect={setSelected}
                />
              ) : selected?.startsWith('c:') ? (
                <ConceptPeek id={selected.slice(2)} onSelect={setSelected} />
              ) : (
                <div className={styles.peek}>
                  <div className={styles.stats}>
                    <span>
                      문서 <b>{docCount}</b>
                    </span>
                    <span>
                      개념 <b>{graph.nodes.length - docCount}</b>
                    </span>
                    <span>
                      연결 <b>{graph.links.length}</b>
                    </span>
                  </div>
                  <div className={styles.howto}>
                    <Sparkles size={14} />
                    <div>
                      <b>AI가 이렇게 씁니다</b>
                      <p>
                        AI 비서나 에이전트가 휴가·고객 응대·문자·정산처럼 회사 기준이 걸린 일을 할
                        때 먼저 지식베이스를 찾아 읽고, 그 기준대로 처리한 뒤 근거 문서를 밝힙니다.
                      </p>
                    </div>
                  </div>
                  <h3 className={styles.peekTitle}>최근 문서</h3>
                  <ul className={styles.docList}>
                    {docs.slice(0, 12).map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => setSelected(`d:${d.id}`)}>
                          <FileText size={13} />
                          <span>{d.title}</span>
                          {d.analyzeStatus !== 'DONE' && <Status d={d} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.muted}>점을 누르면 내용과 이어진 개념을 봅니다.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
      {modal}
    </ListPage>
  );
}

/** 그래프 옆 — 문서 미리보기 */
function DocPeek({
  id,
  onOpen,
  onSelect,
}: {
  id: string;
  onOpen: () => void;
  onSelect: (id: string) => void;
}) {
  const [d, setD] = useState<KnowledgeDocView | null>(null);
  useEffect(() => {
    setD(null);
    void api<KnowledgeDocView>(`/knowledge/docs/${id}`)
      .then(setD)
      .catch(() => undefined);
  }, [id]);
  if (!d) return <div className={styles.peek}>불러오는 중…</div>;
  const rules = d.concepts.filter((c) => c.kind === 'RULE');
  const others = d.concepts.filter((c) => c.kind !== 'RULE');
  return (
    <div className={styles.peek}>
      <div className={styles.peekHead}>
        <CategoryTag c={d.category} />
        <Status d={d} />
      </div>
      <h2 className={styles.peekName}>{d.title}</h2>
      {d.summary && <p className={styles.summary}>{d.summary}</p>}
      {d.keywords.length > 0 && (
        <div className={styles.chips}>
          {d.keywords.map((k) => (
            <span key={k} className={styles.kw}>
              #{k}
            </span>
          ))}
        </div>
      )}
      {rules.length > 0 && (
        <>
          <h3 className={styles.peekTitle}>규칙</h3>
          <ul className={styles.rules}>
            {rules.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onSelect(`c:${c.id}`)}>
                  <b>{c.name}</b>
                </button>
                {c.description && <span>{c.description}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <h3 className={styles.peekTitle}>개념</h3>
          <div className={styles.chips}>
            {others.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.concept}
                onClick={() => onSelect(`c:${c.id}`)}
                title={c.description ?? undefined}
              >
                <i style={{ background: KNOWLEDGE_CONCEPT_COLOR[c.kind] }} />
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
      {d.related.length > 0 && (
        <>
          <h3 className={styles.peekTitle}>이어진 문서</h3>
          <ul className={styles.docList}>
            {d.related.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onSelect(`d:${r.id}`)}>
                  <FileText size={13} />
                  <span>{r.title}</span>
                  <span className={styles.muted}>개념 {r.shared}개 공유</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button variant="outline" size="sm" onClick={onOpen}>
        본문 보기
      </Button>
    </div>
  );
}

/** 그래프 옆 — 개념 미리보기 */
function ConceptPeek({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const [c, setC] = useState<ConceptView | null>(null);
  useEffect(() => {
    setC(null);
    void api<ConceptView>(`/knowledge/concepts/${id}`)
      .then(setC)
      .catch(() => undefined);
  }, [id]);
  if (!c) return <div className={styles.peek}>불러오는 중…</div>;
  return (
    <div className={styles.peek}>
      <div className={styles.peekHead}>
        <KindTag k={c.kind} />
      </div>
      <h2 className={styles.peekName}>{c.name}</h2>
      {c.description && <p className={styles.summary}>{c.description}</p>}
      {c.relations.length > 0 && (
        <>
          <h3 className={styles.peekTitle}>관계</h3>
          <ul className={styles.relations}>
            {c.relations.map((r, i) => (
              <li key={i}>
                {r.from} <span className={styles.rel}>{r.label}</span> {r.to}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className={styles.peekTitle}>나오는 문서</h3>
      <ul className={styles.docList}>
        {c.docs.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onSelect(`d:${d.id}`)}>
              <FileText size={13} />
              <span>{d.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 문서 상세 — 본문(마크다운)·AI가 정리한 개념·관계 */
function DocDetail({
  id,
  onBack,
  onEdit,
  onChanged,
  onOpen,
}: {
  id: string;
  onBack: () => void;
  onEdit: (d: KnowledgeDocView) => void;
  onChanged: () => Promise<void> | void;
  onOpen: (id: string) => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const [d, setD] = useState<KnowledgeDocView | null>(null);
  const load = useCallback(async () => {
    try {
      setD(await api<KnowledgeDocView>(`/knowledge/docs/${id}`));
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
    }
  }, [id, toast]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (d?.analyzeStatus !== 'PENDING') return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [d?.analyzeStatus, load]);

  const reanalyze = async () => {
    try {
      await api(`/knowledge/docs/${id}/analyze`, { method: 'POST' });
      toast({ type: 'success', title: 'AI가 다시 정리하고 있습니다' });
      await load();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '하지 못했습니다' });
    }
  };
  const remove = async () => {
    if (
      !d ||
      !window.confirm(`'${d.title}'을(를) 지울까요? AI가 이 문서를 더는 참고하지 않습니다.`)
    )
      return;
    try {
      await api(`/knowledge/docs/${id}`, { method: 'DELETE' });
      await onChanged();
      onBack();
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '지우지 못했습니다' });
    }
  };

  const byKind = KNOWLEDGE_CONCEPT_KINDS.map((k) => ({
    k,
    list: (d?.concepts ?? []).filter((c) => c.kind === k),
  })).filter((g) => g.list.length);

  return (
    <RecordDetail
      loading={!d}
      title={d?.title ?? ''}
      backLabel="지식베이스"
      onBack={onBack}
      actions={
        d ? (
          <>
            {can('KNOWLEDGE.DELETE') && (
              <Button variant="ghost" size="sm" onClick={() => void remove()}>
                삭제
              </Button>
            )}
            {d.canEdit && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw size={13} />}
                onClick={() => void reanalyze()}
              >
                AI 다시 정리
              </Button>
            )}
            {d.canEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(d)}>
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
                  { label: '분류', value: <CategoryTag c={d.category} /> },
                  { label: 'AI 정리', value: <Status d={d} /> },
                  { label: '요약', value: d.summary, wide: true },
                  {
                    label: '키워드',
                    value: d.keywords.length ? d.keywords.map((k) => `#${k}`).join(' ') : null,
                    wide: true,
                  },
                  { label: '올린 파일', value: d.sourceName },
                  {
                    label: '마지막 수정',
                    value: `${when(d.updatedAt)}${d.updatedByName ? ` · ${d.updatedByName}` : ''}`,
                  },
                  ...(d.analyzeStatus === 'ERROR'
                    ? [{ label: '정리 실패 이유', value: d.analyzeError, wide: true }]
                    : []),
                ],
              },
            ]
          : []
      }
    >
      {d && (
        <>
          {byKind.length > 0 && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>AI가 정리한 개념</h3>
              <div className={styles.kinds}>
                {byKind.map((g) => (
                  <div key={g.k}>
                    <KindTag k={g.k} />
                    <ul className={styles.rules}>
                      {g.list.map((c) => (
                        <li key={c.id}>
                          <b>{c.name}</b>
                          {c.description && <span>{c.description}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {d.relations.length > 0 && (
                <ul className={styles.relations}>
                  {d.relations.map((r, i) => (
                    <li key={i}>
                      {r.from} <span className={styles.rel}>{r.label}</span> {r.to}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {d.related.length > 0 && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>이어진 문서</h3>
              <div className={styles.chips}>
                {d.related.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={styles.concept}
                    onClick={() => onOpen(r.id)}
                  >
                    <FileText size={12} /> {r.title}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className={`${styles.block} ${styles.content}`}>
            <h3 className={styles.blockTitle}>본문</h3>
            <Markdown text={d.content} />
          </section>
        </>
      )}
    </RecordDetail>
  );
}

const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
    r.readAsDataURL(f);
  });

/** 문서 추가(직접 쓰기 · 파일 올리기)·수정 */
function DocModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: KnowledgeDocView | 'new' | null;
  onClose: () => void;
  onSaved: (id: string | null) => Promise<void> | void;
}) {
  const toast = useToast();
  const isNew = editing === 'new';
  const [mode, setMode] = useState<'write' | 'file'>('write');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory>('ETC');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    setMode('write');
    setFile(null);
    if (editing === 'new') {
      setTitle('');
      setCategory('ETC');
      setContent('');
    } else {
      setTitle(editing.title);
      setCategory(editing.category);
      setContent(editing.content);
    }
  }, [editing]);

  const ready = mode === 'file' ? !!file : !!title.trim() && !!content.trim();
  const save = async () => {
    setBusy(true);
    try {
      let id: string | null = null;
      if (isNew && mode === 'file' && file) {
        const r = await api<{ id: string }>('/knowledge/docs/upload', {
          method: 'POST',
          body: JSON.stringify({
            name: file.name,
            dataBase64: await readBase64(file),
            category,
            ...(title.trim() && { title: title.trim() }),
          }),
        });
        id = r.id;
      } else if (isNew) {
        id = (
          await api<{ id: string }>('/knowledge/docs', {
            method: 'POST',
            body: JSON.stringify({ title, category, content }),
          })
        ).id;
      } else if (editing) {
        await api(`/knowledge/docs/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, category, content }),
        });
        id = editing.id;
      }
      toast({
        type: 'success',
        title: '저장했습니다 — AI가 개념과 관계를 정리하고 있어요',
      });
      await onSaved(id);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={editing !== null}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? '지식 문서 추가' : '문서 수정'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void save()}>
            {mode === 'file' && isNew ? '올리기' : '저장'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {isNew && (
          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as 'write' | 'file')}
            options={[
              { value: 'write', label: '직접 쓰기' },
              { value: 'file', label: '파일 올리기' },
            ]}
          />
        )}
        <div className={styles.row2}>
          <label className={styles.field}>
            <span>제목{mode === 'file' && isNew ? '(비우면 파일 이름)' : ''}</span>
            <Input
              value={title}
              maxLength={120}
              placeholder="예: 연차·휴가 사용 지침"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>분류</span>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as KnowledgeCategory)}
              options={KNOWLEDGE_CATEGORIES.map((c) => ({
                value: c,
                label: c === 'ETC' ? '기타(AI가 고름)' : KNOWLEDGE_CATEGORY_LABEL[c],
              }))}
              aria-label="분류"
            />
          </label>
        </div>
        {mode === 'file' && isNew ? (
          <div className={styles.drop} onClick={() => fileRef.current?.click()} role="button">
            <FileUp size={22} />
            <b>{file ? file.name : '파일 고르기'}</b>
            <span className={styles.muted}>
              PDF · Word(.docx) · 엑셀(.xlsx) · 텍스트(.md·.txt), 15MB까지. PDF는 AI가 읽어 글로
              옮깁니다.
            </span>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.docx,.xlsx,.md,.txt,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <label className={styles.field}>
            <span>내용(마크다운 — # 제목, - 목록)</span>
            <Textarea
              rows={16}
              value={content}
              placeholder={
                '# 연차·휴가 사용 지침\n\n## 신청\n- 연차는 사용일 3일 전까지 결재로 올린다\n- 반차는 오전(09~13시)·오후(14~18시)'
              }
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
        )}
        <p className={styles.muted}>
          저장하면 AI가 요약·키워드와 개념(용어·규칙·역할·절차), 개념 사이 관계를 뽑아 그래프에
          잇습니다.
        </p>
      </div>
    </Modal>
  );
}
