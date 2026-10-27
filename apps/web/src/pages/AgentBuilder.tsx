import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  CircleAlert,
  LayoutGrid,
  PanelLeft,
  Play,
  Redo2,
  Save,
  Sparkles,
  Spline,
  Undo2,
} from 'lucide-react';
import { SegmentedControl } from '@sunghoon_lee/akron-ui';
import {
  AGENT_NODE_DESC,
  AGENT_NODE_LABEL,
  AGENT_NODE_TYPES,
  AGENT_VISIBILITY_LABEL,
  autoLayout,
  defaultConfig,
  newAgentId,
  nodeRefs,
  normalizeAgentGraph,
  outputPorts,
  producedVars,
  refRoot,
  upstreamVars,
  validateAgentGraph,
  type AgentEdge,
  type AgentGraph,
  type AgentIssue,
  type AgentNode,
  type AgentNodeType,
  type AgentToolInfo,
  type AgentVisibility,
  type ToolConfig,
  type TriggerConfig,
} from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Modal, Spinner, useToast, PageSkeleton } from '../components/ui';
import AgentNodeView, { type AgentFlowNode, type RunMark } from '../components/agent/AgentNodeView';
import { Inspector } from '../components/agent/Inspector';
import { DND_MIME, ToolExplorer } from '../components/agent/ToolExplorer';
import { RunPanel, type AgentRunView } from '../components/agent/RunPanel';
import { SharePicker, VISIBILITY_ICON, type ShareCandidate } from '../components/agent/SharePicker';
import { NODE_COLOR, NODE_HEX, NODE_ICON, nodeSummary } from '../components/agent/meta';
import styles from './agentBuilder.module.css';

interface Blueprint {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE';
  graph: AgentGraph;
  prompt: string | null;
  updatedAt: string;
  visibility: AgentVisibility;
  shares: BlueprintShare[];
  canEdit: boolean;
  isMine: boolean;
  createdByName: string | null;
}

/** 공유된 직원(서버 응답) */
interface BlueprintShare {
  employeeId: string;
  name: string;
  orgUnitName: string;
  positionName: string | null;
}

interface GenerateResult {
  name: string;
  description: string;
  summary: string;
  graph: AgentGraph;
  changes: {
    added: string[];
    removed: string[];
    changed: string[];
    edgesAdded: number;
    edgesRemoved: number;
  };
  fixes: string[];
  issues: AgentIssue[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

const nodeTypes = { agent: AgentNodeView };
const HISTORY_MAX = 80;

/** 도구 설명 "[접수(리드)] 목록 조회. …" → "접수(리드) 목록 조회" */
function toolLabel(t: AgentToolInfo) {
  const m = /^\[([^\]]+)\]\s*([^.]+)/.exec(t.description);
  const s = m ? `${m[1]} ${m[2]}` : t.name;
  return s.length > 22 ? `${s.slice(0, 21)}…` : s;
}

export default function AgentBuilder() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

function Editor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { resolved } = useTheme();
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Omit<Blueprint, 'graph'> | null>(null);
  const [graph, setGraph] = useState<AgentGraph>({ version: 1, nodes: [], edges: [] });
  const [saved, setSaved] = useState('');
  const [past, setPast] = useState<AgentGraph[]>([]);
  const [future, setFuture] = useState<AgentGraph[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [tools, setTools] = useState<AgentToolInfo[] | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showData, setShowData] = useState(true);
  const [nlOpen, setNlOpen] = useState(false);
  const [nlText, setNlText] = useState('');
  const [nlMode, setNlMode] = useState<'refine' | 'new'>('refine');
  const [nlLoading, setNlLoading] = useState(false);
  const [preview, setPreview] = useState<GenerateResult | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  // 제어 모드라 React Flow가 잰 노드 크기를 직접 들고 있어야 미니맵·맞춤 보기가 노드를 안다
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [run, setRun] = useState<AgentRunView | null>(null);
  const [running, setRunning] = useState(false);

  // ── 불러오기 ── (id가 바뀔 때만 — 토스트·라우터 함수는 ref로 잡아 다시 불러오지 않게)
  const deps = useRef({ navigate, rf, toast });
  deps.current = { navigate, rf, toast };
  useEffect(() => {
    const { navigate, toast } = deps.current;
    let alive = true;
    (async () => {
      try {
        const [bp, list, st] = await Promise.all([
          api<Blueprint>(`/agent-blueprints/${id}`),
          api<AgentToolInfo[]>('/agent-blueprints/tools'),
          api<{ aiConfigured: boolean }>('/agent-blueprints/status'),
        ]);
        if (!alive) return;
        const { graph: g, ...m } = bp;
        const ng = normalizeAgentGraph(g);
        setMeta(m);
        setGraph(ng);
        setSaved(JSON.stringify({ m: [m.name, m.description, m.status], g: ng }));
        setTools(list);
        setAiConfigured(st.aiConfigured);
        setNlMode(ng.nodes.length ? 'refine' : 'new');
        setNlOpen(!ng.nodes.length);
      } catch (e) {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : '불러오지 못했습니다' });
        navigate('/agent-builder');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // 처음 열 때 한 번 — 모든 노드 크기를 잰 뒤에 화면에 맞춘다(제어 모드에선 fitView 속성만으로는 안 맞는다)
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitted.current === id || !graph.nodes.length) return;
    if (!graph.nodes.every((n) => measured[n.id])) return;
    fitted.current = id;
    requestAnimationFrame(() => void rf.fitView({ padding: 0.15, maxZoom: 1 }));
  }, [id, graph.nodes, measured, rf]);

  const toolMap = useMemo(() => new Map((tools ?? []).map((t) => [t.name, t])), [tools]);
  const issues = useMemo(
    () => validateAgentGraph(graph, tools ? toolMap : undefined),
    [graph, tools, toolMap],
  );
  const issuesByNode = useMemo(() => {
    const m = new Map<string, AgentIssue[]>();
    for (const i of issues) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i]);
    return m;
  }, [issues]);
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.length - errorCount;
  const varsByNode = useMemo(() => upstreamVars(graph), [graph]);

  const dirty =
    !!meta && saved !== JSON.stringify({ m: [meta.name, meta.description, meta.status], g: graph });
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ── 바꾸기(되돌리기 기록) ──
  const commit = useCallback(
    (next: AgentGraph | ((g: AgentGraph) => AgentGraph), record = true) => {
      setGraph((cur) => {
        const n = typeof next === 'function' ? next(cur) : next;
        if (record && n !== cur) {
          setPast((p) => [...p.slice(-HISTORY_MAX + 1), cur]);
          setFuture([]);
        }
        return n;
      });
    },
    [],
  );
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setGraph((cur) => {
        setFuture((f) => [cur, ...f]);
        return prev;
      });
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const nx = f[0];
      setGraph((cur) => {
        setPast((p) => [...p, cur]);
        return nx;
      });
      return f.slice(1);
    });
  }, []);

  const updateNode = useCallback(
    (n: AgentNode) => commit((g) => ({ ...g, nodes: g.nodes.map((x) => (x.id === n.id ? n : x)) })),
    [commit],
  );
  const deleteNodes = useCallback(
    (ids: string[]) => {
      const s = new Set(ids);
      commit((g) => ({
        ...g,
        nodes: g.nodes.filter((n) => !s.has(n.id)),
        edges: g.edges.filter((e) => !s.has(e.source) && !s.has(e.target)),
      }));
      setSelectedId((cur) => (cur && s.has(cur) ? null : cur));
    },
    [commit],
  );

  const uniqueVar = useCallback(
    (base: string) => {
      const used = new Set(graph.nodes.flatMap((n) => producedVars(n).map((v) => v.name)));
      if (!used.has(base)) return base;
      let i = 2;
      while (used.has(`${base}${i}`)) i++;
      return `${base}${i}`;
    },
    [graph],
  );

  const addNode = useCallback(
    (type: AgentNodeType, position?: { x: number; y: number }, tool?: AgentToolInfo) => {
      const cfg = defaultConfig(type) as unknown as Record<string, unknown>;
      if (type === 'tool' && tool) {
        cfg.tool = tool.name;
        cfg.outputVar = uniqueVar(tool.name.startsWith('search_') ? tool.name.slice(7) : 'result');
      } else if (type === 'llm') cfg.outputVar = uniqueVar('answer');
      else if (type === 'branch') cfg.outputVar = uniqueVar('category');
      else if (type === 'tool') cfg.outputVar = uniqueVar('result');
      let pos = position;
      if (!pos) {
        // 누르기로 추가하면 고른 노드 오른쪽(없으면 화면 가운데)에 두고, 겹치면 아래로 비킨다
        const anchor = graph.nodes.find((x) => x.id === selectedId);
        const b = wrapRef.current?.getBoundingClientRect();
        pos = anchor
          ? { x: anchor.position.x + 300, y: anchor.position.y }
          : rf.screenToFlowPosition({
              x: (b?.left ?? 0) + (b?.width ?? 800) / 2 - 110,
              y: (b?.top ?? 0) + (b?.height ?? 600) / 2 - 40,
            });
        const taken = (p: { x: number; y: number }) =>
          graph.nodes.some(
            (x) => Math.abs(x.position.x - p.x) < 230 && Math.abs(x.position.y - p.y) < 150,
          );
        while (taken(pos)) pos = { x: pos.x, y: pos.y + 170 };
      }
      const n: AgentNode = {
        id: newAgentId(type),
        type,
        label: tool ? toolLabel(tool) : AGENT_NODE_LABEL[type],
        position: pos,
        config: cfg as never,
      };
      commit((g) => ({ ...g, nodes: [...g.nodes, n] }));
      setSelectedId(n.id);
    },
    [commit, rf, uniqueVar, graph.nodes, selectedId],
  );

  const duplicateNode = useCallback(
    (n: AgentNode) => {
      const copy: AgentNode = {
        ...JSON.parse(JSON.stringify(n)),
        id: newAgentId(n.type),
        label: `${n.label} 복사`,
        position: { x: n.position.x + 40, y: n.position.y + 60 },
      };
      commit((g) => ({ ...g, nodes: [...g.nodes, copy] }));
      setSelectedId(copy.id);
    },
    [commit],
  );

  // ── 실행 경로 표시 ──
  const { runMarks, walked } = useMemo(() => {
    const marks = new Map<string, RunMark>();
    const w = new Set<string>();
    for (const s of run?.trace ?? []) {
      const prev = marks.get(s.nodeId);
      // 반복에서 여러 번 지나가면 나쁜 상태가 남게
      if (!prev || prev === 'ok' || prev === 'dry') marks.set(s.nodeId, s.status);
      if (s.port) w.add(`${s.nodeId}:${s.port}`);
    }
    return { runMarks: marks, walked: w };
  }, [run]);

  // ── React Flow 노드·선 ──
  const rfNodes: AgentFlowNode[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const iss = issuesByNode.get(n.id) ?? [];
        return {
          id: n.id,
          type: 'agent' as const,
          position: n.position,
          ...(measured[n.id] ? { measured: measured[n.id] } : {}),
          selected: n.id === selectedId,
          data: {
            node: n,
            summary: nodeSummary(n, toolMap),
            errors: iss.filter((i) => i.level === 'error').length,
            warnings: iss.filter((i) => i.level === 'warning').length,
            run: runMarks.get(n.id),
            dim: !!run && !runMarks.has(n.id),
          },
        };
      }),
    [graph.nodes, issuesByNode, selectedId, toolMap, runMarks, run, measured],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const exec: Edge[] = graph.edges.map((e) => {
      const src = byId.get(e.source);
      const port = src ? outputPorts(src).find((p) => p.id === e.sourceHandle) : undefined;
      const hot = walked.has(`${e.source}:${e.sourceHandle}`);
      const sel = e.id === selectedEdge;
      const color = hot
        ? 'var(--ab-output)'
        : sel
          ? 'var(--ark-color-primary-500)'
          : 'var(--ab-wire)';
      return {
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: 'in',
        selected: sel,
        animated: hot,
        label: port && src && outputPorts(src).length > 1 ? port.label : undefined,
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        style: { stroke: color, strokeWidth: hot ? 3 : 2.2 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });
    if (!showData) return exec;
    // 데이터선 — {{변수}} 참조를 만든 노드 → 쓰는 노드로 점선
    const data: Edge[] = [];
    const seen = new Set<string>();
    for (const n of graph.nodes) {
      const vars = varsByNode.get(n.id) ?? [];
      for (const ref of nodeRefs(n)) {
        const root = refRoot(ref);
        const producer = vars.find((v) => v.nodeId && v.name === root)?.nodeId;
        if (!producer || producer === n.id) continue;
        const key = `${producer}>${n.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        data.push({
          id: `data_${key}`,
          source: producer,
          sourceHandle: 'data-out',
          target: n.id,
          targetHandle: 'data-in',
          selectable: false,
          focusable: false,
          deletable: false,
          zIndex: -1,
          style: {
            stroke: 'var(--ab-data)',
            strokeWidth: 1.2,
            strokeDasharray: '4 4',
            opacity: 0.7,
          },
        });
      }
    }
    return [...data, ...exec];
  }, [graph, walked, selectedEdge, showData, varsByNode]);

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentFlowNode>[]) => {
      const moves = new Map<string, { x: number; y: number }>();
      const removed: string[] = [];
      for (const c of changes) {
        if (c.type === 'position' && c.position) moves.set(c.id, c.position);
        else if (c.type === 'dimensions' && c.dimensions) {
          const d = c.dimensions;
          setMeasured((m) =>
            m[c.id]?.width === d.width && m[c.id]?.height === d.height ? m : { ...m, [c.id]: d },
          );
        } else if (c.type === 'select') {
          if (c.selected) {
            setSelectedId(c.id);
            setSelectedEdge(null);
          } else setSelectedId((cur) => (cur === c.id ? null : cur));
        } else if (c.type === 'remove') removed.push(c.id);
      }
      if (moves.size)
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((n) => (moves.has(n.id) ? { ...n, position: moves.get(n.id)! } : n)),
        }));
      if (removed.length) deleteNodes(removed);
    },
    [deleteNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed = new Set<string>();
      for (const c of changes) {
        if (c.type === 'remove' && !c.id.startsWith('data_')) removed.add(c.id);
        else if (c.type === 'select' && !c.id.startsWith('data_')) {
          setSelectedEdge(c.selected ? c.id : null);
          if (c.selected) setSelectedId(null);
        }
      }
      if (removed.size) commit((g) => ({ ...g, edges: g.edges.filter((e) => !removed.has(e.id)) }));
    },
    [commit],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !c.sourceHandle || c.targetHandle !== 'in') return;
      const edge: AgentEdge = {
        id: `e_${c.source}_${c.sourceHandle}_${c.target}_${Date.now().toString(36)}`,
        source: c.source,
        sourceHandle: c.sourceHandle,
        target: c.target,
      };
      // 언리얼 블루프린트처럼 실행 출력 포트 하나엔 선 하나 — 새로 이으면 이전 선을 바꾼다
      commit((g) => ({
        ...g,
        edges: [
          ...g.edges.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)),
          edge,
        ],
      }));
    },
    [commit],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) =>
      c.source !== c.target &&
      c.targetHandle === 'in' &&
      c.sourceHandle !== 'data-out' &&
      graph.nodes.find((n) => n.id === c.target)?.type !== 'trigger',
    [graph.nodes],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      const raw = e.dataTransfer.getData(DND_MIME);
      if (!raw) return;
      e.preventDefault();
      const d = JSON.parse(raw) as { type: AgentNodeType; tool?: string };
      const pos = rf.screenToFlowPosition({ x: e.clientX - 100, y: e.clientY - 20 });
      addNode(d.type, pos, d.tool ? toolMap.get(d.tool) : undefined);
    },
    [addNode, rf, toolMap],
  );

  // ── 저장 ──
  const save = useCallback(async () => {
    if (!meta) return;
    if (!meta.canEdit) {
      toast({ type: 'warning', title: '만든 사람만 저장할 수 있습니다. 복제해서 고쳐 쓰세요.' });
      return;
    }
    setSaving(true);
    try {
      const b = await api<Blueprint>(`/agent-blueprints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: meta.name,
          description: meta.description,
          status: meta.status,
          graph,
          ...(meta.prompt !== null ? { prompt: meta.prompt } : {}),
        }),
      });
      const ng = normalizeAgentGraph(b.graph);
      setSaved(JSON.stringify({ m: [b.name, b.description, b.status], g: ng }));
      setGraph(ng);
      setMeta((m) => (m ? { ...m, updatedAt: b.updatedAt } : m));
      toast({
        type: errorCount ? 'warning' : 'success',
        title: errorCount
          ? `저장했습니다 — 오류 ${errorCount}개가 남아 있어 실행은 안 됩니다`
          : '저장했습니다',
      });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  }, [meta, id, graph, errorCount, toast]);

  // 단축키 — 되돌리기·다시하기·저장
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo, save]);

  const focusNode = useCallback(
    (nodeId: string) => {
      const n = graph.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      setSelectedId(nodeId);
      void rf.setCenter(n.position.x + 120, n.position.y + 60, {
        zoom: Math.max(rf.getZoom(), 0.9),
        duration: 300,
      });
    },
    [graph.nodes, rf],
  );

  // ── 자연어로 만들기·수정하기 ──
  const generate = async () => {
    if (!nlText.trim()) return;
    setNlLoading(true);
    try {
      const res = await api<GenerateResult>('/agent-blueprints/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: nlText.trim(),
          ...(nlMode === 'refine' && graph.nodes.length ? { blueprintId: id, graph } : {}),
        }),
      });
      setPreview(res);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
    } finally {
      setNlLoading(false);
    }
  };
  const applyPreview = () => {
    if (!preview || !meta) return;
    commit(preview.graph);
    setMeta({
      ...meta,
      prompt: nlText.trim(),
      ...(meta.name === '새 에이전트' || !graph.nodes.length
        ? { name: preview.name || meta.name, description: preview.description || meta.description }
        : {}),
    });
    setPreview(null);
    setNlText('');
    setNlMode('refine');
    setRun(null);
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
  };

  // ── 테스트 실행 ──
  const startRun = async (opts: {
    input: Record<string, unknown>;
    dryRun: boolean;
    mockLlm: boolean;
  }) => {
    if (errorCount) {
      setShowIssues(true);
      toast({ type: 'error', title: `오류 ${errorCount}개를 먼저 고쳐 주세요` });
      return;
    }
    setRunning(true);
    setRun(null);
    try {
      setRun(
        await api<AgentRunView>(`/agent-blueprints/${id}/run`, {
          method: 'POST',
          body: JSON.stringify({ ...opts, graph }),
        }),
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '실행하지 못했습니다' });
    } finally {
      setRunning(false);
    }
  };
  const decide = async (approve: boolean) => {
    if (!run) return;
    setRunning(true);
    try {
      setRun(
        await api<AgentRunView>(`/agent-runs/${run.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ approve }),
        }),
      );
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '처리하지 못했습니다' });
    } finally {
      setRunning(false);
    }
  };

  if (loading || !meta) {
    return (
      <div style={{ padding: 4 }}>
        <PageSkeleton />
      </div>
    );
  }

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const VisIcon = VISIBILITY_ICON[meta.visibility] ?? VISIBILITY_ICON.PRIVATE;
  const trigger =
    (graph.nodes.find((n) => n.type === 'trigger')?.config as TriggerConfig | undefined) ?? null;

  return (
    <div className={styles.page}>
      {/* ── 툴바 ── */}
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => navigate('/agent-builder')}
          title="목록으로"
        >
          <ArrowLeft size={14} />
        </button>
        <input
          className={styles.nameInput}
          value={meta.name}
          onChange={(e) => setMeta({ ...meta, name: e.target.value })}
          aria-label="에이전트 이름"
        />
        <SegmentedControl
          size="sm"
          value={meta.status}
          onChange={(v) => meta.canEdit && setMeta({ ...meta, status: v as 'DRAFT' | 'ACTIVE' })}
          options={[
            { value: 'DRAFT', label: '초안', disabled: !meta.canEdit },
            { value: 'ACTIVE', label: '사용중', disabled: !meta.canEdit },
          ]}
        />
        {dirty && <span className={styles.dirty}>저장 안 됨</span>}
        <span className={styles.spacer} />
        <button
          type="button"
          className={`${styles.iconBtn} ${leftOpen ? styles.iconBtnActive : ''}`}
          onClick={() => setLeftOpen((v) => !v)}
          title="노드·도구 패널 접기/펴기"
        >
          <PanelLeft size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={undo}
          disabled={!past.length}
          title="되돌리기(⌘Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={redo}
          disabled={!future.length}
          title="다시하기(⇧⌘Z)"
        >
          <Redo2 size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="자동 정렬"
          onClick={() => {
            commit((g) => autoLayout(g));
            setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 30);
          }}
        >
          <LayoutGrid size={14} /> 정렬
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${showData ? styles.iconBtnActive : ''}`}
          title="데이터선({{변수}} 참조) 보이기"
          onClick={() => setShowData((v) => !v)}
        >
          <Spline size={14} /> 데이터선
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={`${styles.iconBtn} ${showIssues ? styles.iconBtnActive : ''}`}
            onClick={() => setShowIssues((v) => !v)}
            title="검사 결과"
          >
            <CircleAlert size={14} />
            <span className={styles.issueCount}>
              검사 {errorCount > 0 && <span className={styles.errDot}>{errorCount}</span>}
              {warnCount > 0 && <span className={styles.warnDot}>{warnCount}</span>}
              {!issues.length && '✓'}
            </span>
          </button>
          {showIssues && (
            <div
              className={styles.suggest}
              style={{ width: 380, right: 0, left: 'auto', maxHeight: 360, padding: 6 }}
            >
              {!issues.length && (
                <div className={styles.note} style={{ padding: 6 }}>
                  문제가 없습니다.
                </div>
              )}
              <div className={styles.issueList}>
                {issues.map((i, k) => (
                  <button
                    key={k}
                    type="button"
                    className={styles.issueItem}
                    onClick={() => i.nodeId && focusNode(i.nodeId)}
                  >
                    <span className={i.level === 'error' ? styles.errDot : styles.warnDot}>
                      {i.level === 'error' ? '오류' : '경고'}
                    </span>
                    <span>{i.message}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${styles.iconBtn} ${nlOpen ? styles.iconBtnActive : ''}`}
          onClick={() => setNlOpen((v) => !v)}
        >
          <Sparkles size={14} /> 자연어로 {graph.nodes.length ? '수정하기' : '만들기'}
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${runOpen ? styles.iconBtnActive : ''}`}
          onClick={() => setRunOpen((v) => !v)}
        >
          <Play size={14} /> 테스트 실행
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setShareOpen(true)}
          title="누가 쓸 수 있는지(공개 범위)"
        >
          <VisIcon size={14} /> {AGENT_VISIBILITY_LABEL[meta.visibility]}
          {meta.visibility === 'SHARED' ? ` ${meta.shares.length}명` : ''}
        </button>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!meta.canEdit}
          leftIcon={<Save size={13} />}
          onClick={() => void save()}
        >
          저장
        </Button>
      </div>
      {!meta.canEdit && (
        <div className={styles.readonlyBar}>
          {meta.createdByName ?? '다른 사람'}님이 만든 에이전트라 보기·테스트만 할 수 있습니다. 고쳐
          쓰려면 목록에서 <b>복제</b>하세요.
        </div>
      )}

      {/* ── 자연어 바 ── */}
      {nlOpen && (
        <div className={styles.nlBar}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <textarea
              className={styles.textarea}
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate();
              }}
              placeholder={
                nlMode === 'refine' && graph.nodes.length
                  ? '고칠 내용을 말해 주세요. 예: 문자 보내기 전에 수신자를 30명으로 제한하고, 대상이 없으면 담당자에게 알려 줘'
                  : '어떤 일을 하는 에이전트인지 말해 주세요. 예: 매일 아침 어제 들어온 접수 중 상담 배정이 안 된 건을 찾아 지점장에게 문자로 알려 줘'
              }
            />
            <div className={styles.nlHint}>
              {aiConfigured
                ? 'Claude가 실제 호출 가능한 도구 목록을 보고 노드·분기·가드레일까지 설계합니다. 결과는 미리 보고 적용합니다(⌘+Enter).'
                : 'ANTHROPIC_API_KEY가 설정되지 않아 자연어 생성은 쓸 수 없습니다. 왼쪽 팔레트·도구로 직접 만들 수 있습니다.'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {graph.nodes.length > 0 && (
              <SegmentedControl
                size="sm"
                value={nlMode}
                onChange={(v) => setNlMode(v as 'refine' | 'new')}
                options={[
                  { value: 'refine', label: '지금 것 수정' },
                  { value: 'new', label: '새로 만들기' },
                ]}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              loading={nlLoading}
              disabled={!aiConfigured || !nlText.trim()}
              leftIcon={<Sparkles size={13} />}
              onClick={() => void generate()}
            >
              {nlMode === 'refine' && graph.nodes.length ? '수정안 만들기' : '블루프린트 만들기'}
            </Button>
          </div>
        </div>
      )}

      <div className={`${styles.body} ${leftOpen ? '' : styles.bodyNoLeft}`}>
        {/* ── 왼쪽: 노드 팔레트 + 도구 탐색기 ── */}
        <aside className={styles.left} hidden={!leftOpen}>
          <div className={styles.sectionTitle}>노드 — 끌어다 놓거나 누르기</div>
          <div className={styles.palette}>
            {AGENT_NODE_TYPES.map((t) => {
              const Icon = NODE_ICON[t];
              return (
                <div
                  key={t}
                  className={styles.paletteItem}
                  draggable
                  title={AGENT_NODE_DESC[t]}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, JSON.stringify({ type: t }));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => addNode(t)}
                >
                  <Icon size={13} style={{ color: NODE_COLOR[t] }} />
                  {AGENT_NODE_LABEL[t]}
                </div>
              );
            })}
          </div>
          <div className={styles.explorer}>
            <div className={styles.sectionTitle}>도구 탐색기</div>
            {tools ? (
              <ToolExplorer tools={tools} onPick={(t) => addNode('tool', undefined, t)} />
            ) : (
              <div style={{ padding: 16 }}>
                <Spinner size="sm" />
              </div>
            )}
          </div>
        </aside>

        {/* ── 가운데: 캔버스 ── */}
        <section className={styles.center}>
          <div
            className={styles.canvas}
            ref={wrapRef}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DND_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={onDrop}
          >
            <ReactFlow<AgentFlowNode, Edge>
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeDragStart={() => {
                setPast((p) => [...p.slice(-HISTORY_MAX + 1), graph]);
                setFuture([]);
              }}
              onNodeClick={(_, n) => {
                setSelectedId(n.id);
                setSelectedEdge(null);
              }}
              onEdgeClick={(_, e) => {
                if (e.id.startsWith('data_')) return;
                setSelectedEdge(e.id);
                setSelectedId(null);
              }}
              onPaneClick={() => {
                setSelectedId(null);
                setSelectedEdge(null);
                setShowIssues(false);
              }}
              colorMode={resolved === 'dark' ? 'dark' : 'light'}
              deleteKeyCode={['Backspace', 'Delete']}
              connectionRadius={28}
              minZoom={0.2}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => NODE_HEX[(n.data as { node: AgentNode }).node.type]}
                nodeStrokeWidth={2}
              />
            </ReactFlow>
            {!graph.nodes.length && (
              <div className={styles.emptyCanvas}>
                빈 캔버스입니다.
                <br />
                위의 &quot;자연어로 만들기&quot;로 시작하거나, 왼쪽에서 시작 노드부터 끌어다 놓고
                포트를 이어 보세요.
              </div>
            )}
          </div>
          {runOpen && (
            <RunPanel
              trigger={trigger}
              run={run}
              running={running}
              aiConfigured={aiConfigured}
              onRun={(o) => void startRun(o)}
              onDecide={(a) => void decide(a)}
              onSelectNode={focusNode}
              onClose={() => {
                setRunOpen(false);
                setRun(null);
              }}
            />
          )}
        </section>

        {/* ── 오른쪽: 속성 ── */}
        <aside className={styles.right}>
          {selected ? (
            <Inspector
              key={selected.id}
              node={selected}
              vars={varsByNode.get(selected.id) ?? []}
              tools={tools ?? []}
              toolMap={toolMap}
              issues={issuesByNode.get(selected.id) ?? []}
              onChange={updateNode}
              onDelete={() => deleteNodes([selected.id])}
              onDuplicate={() => duplicateNode(selected)}
            />
          ) : (
            <div className={styles.inspector}>
              <label className={styles.label}>
                <span>설명</span>
                <textarea
                  className={styles.textarea}
                  value={meta.description}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                  placeholder="이 에이전트가 하는 일"
                />
              </label>
              {meta.prompt && (
                <div className={styles.box}>
                  <div className={styles.boxHead}>마지막 자연어 요청</div>
                  <div className={styles.note}>{meta.prompt}</div>
                </div>
              )}
              <div className={styles.box}>
                <div className={styles.boxHead}>구성</div>
                <div className={styles.note}>
                  노드 {graph.nodes.length}개 · 실행선 {graph.edges.length}개 · 도구{' '}
                  {graph.nodes.filter((n) => n.type === 'tool').length}개(쓰기{' '}
                  {
                    graph.nodes.filter(
                      (n) =>
                        n.type === 'tool' &&
                        toolMap.get((n.config as ToolConfig).tool)?.mode === 'WRITE',
                    ).length
                  }
                  )
                </div>
              </div>
              <div className={styles.emptyInspector} style={{ padding: 0 }}>
                노드를 누르면 여기서 자세히 고칩니다.
                <br />• 포트를 끌어 다른 노드의 왼쪽 입력에 이으면 실행선이 생깁니다.
                <br />• 선·노드를 고르고 Delete로 지웁니다.
                <br />• 결과 변수는 뒤 노드에서 {'{{변수}}'}로 씁니다(점선이 데이터 흐름).
                <br />• ⌘Z 되돌리기 · ⇧⌘Z 다시하기 · ⌘S 저장
              </div>
            </div>
          )}
        </aside>
      </div>

      {shareOpen && (
        <ShareModal
          id={id}
          visibility={meta.visibility}
          shares={meta.shares}
          canEdit={meta.canEdit}
          onClose={() => setShareOpen(false)}
          onSaved={(b) => {
            setMeta((m) => (m ? { ...m, visibility: b.visibility, shares: b.shares } : m));
            setShareOpen(false);
          }}
        />
      )}

      {/* ── 자연어 결과 미리보기 ── */}
      <Modal
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        size="lg"
        title={
          nlMode === 'refine' && graph.nodes.length ? '수정안 미리보기' : '만든 블루프린트 미리보기'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              버리기
            </Button>
            <Button variant="primary" onClick={applyPreview}>
              캔버스에 적용
            </Button>
          </>
        }
      >
        {preview && (
          <div className={styles.diff}>
            <div>
              <b>{preview.name}</b>
              <div className={styles.note}>{preview.description}</div>
            </div>
            <div className={styles.diffSummary}>{preview.summary}</div>
            <div className={styles.diffRow}>
              <b className={styles.plus}>추가</b>
              <span>{preview.changes.added.join(', ') || '없음'}</span>
            </div>
            {graph.nodes.length > 0 && nlMode === 'refine' && (
              <>
                <div className={styles.diffRow}>
                  <b className={styles.tilde}>변경</b>
                  <span>{preview.changes.changed.join(', ') || '없음'}</span>
                </div>
                <div className={styles.diffRow}>
                  <b className={styles.minus}>삭제</b>
                  <span>{preview.changes.removed.join(', ') || '없음'}</span>
                </div>
              </>
            )}
            <div className={styles.diffRow}>
              <b>실행선</b>
              <span>
                +{preview.changes.edgesAdded} / −{preview.changes.edgesRemoved}
              </span>
            </div>
            {preview.fixes.length > 0 && (
              <div className={styles.box}>
                <div className={styles.boxHead}>서버가 바로잡은 것</div>
                {preview.fixes.map((f, i) => (
                  <div key={i} className={styles.note}>
                    • {f}
                  </div>
                ))}
              </div>
            )}
            {preview.issues.length > 0 && (
              <div className={styles.box}>
                <div className={styles.boxHead}>검사 결과 — 적용한 뒤 고칠 수 있습니다</div>
                {preview.issues.map((i, k) => (
                  <div
                    key={k}
                    className={i.level === 'error' ? styles.errDot : styles.warnDot}
                    style={{ fontWeight: 400, fontSize: 12 }}
                  >
                    {i.level === 'error' ? '오류' : '경고'} · {i.message}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.note}>
              노드 {preview.graph.nodes.length}개 · 토큰 입력{' '}
              {preview.usage.inputTokens.toLocaleString()}(캐시{' '}
              {preview.usage.cacheReadTokens.toLocaleString()}) / 출력{' '}
              {preview.usage.outputTokens.toLocaleString()} · 적용해도 ⌘Z로 되돌릴 수 있습니다.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** 공개 범위·공유 대상 바꾸기 — 캔버스 저장과 따로 바로 저장한다 */
function ShareModal({
  id,
  visibility,
  shares,
  canEdit,
  onClose,
  onSaved,
}: {
  id: string;
  visibility: AgentVisibility;
  shares: BlueprintShare[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (b: { visibility: AgentVisibility; shares: BlueprintShare[] }) => void;
}) {
  const toast = useToast();
  const [vis, setVis] = useState(visibility);
  const [ids, setIds] = useState(shares.map((s) => s.employeeId));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const b = await api<Blueprint>(`/agent-blueprints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          visibility: vis,
          ...(vis === 'SHARED' ? { shareEmployeeIds: ids } : {}),
        }),
      });
      toast({
        type: 'success',
        title: `공개 범위를 '${AGENT_VISIBILITY_LABEL[vis]}'(으)로 저장했습니다`,
      });
      onSaved({ visibility: b.visibility, shares: b.shares });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '저장하지 못했습니다' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="누가 쓸 수 있나요"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? '취소' : '닫기'}
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              loading={saving}
              disabled={vis === 'SHARED' && ids.length === 0}
              onClick={() => void save()}
            >
              저장
            </Button>
          )}
        </>
      }
    >
      <SharePicker
        visibility={vis}
        shareIds={ids}
        disabled={!canEdit}
        known={shares.map((s): ShareCandidate => ({ ...s, id: s.employeeId }))}
        onChange={(v) => {
          setVis(v.visibility);
          setIds(v.shareIds);
        }}
      />
    </Modal>
  );
}
