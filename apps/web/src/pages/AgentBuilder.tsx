import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
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
  Copy,
  LayoutGrid,
  PanelLeft,
  Play,
  Redo2,
  Save,
  Sparkles,
  Spline,
  Trash2,
  Undo2,
} from 'lucide-react';
import { SegmentedControl, Switch } from '../components/ui';
import {
  AGENT_NODE_DESC,
  AGENT_NODE_TYPES,
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
import { Button, Modal, PopoutButton, Spinner, useToast, PageSkeleton } from '../components/ui';
import AgentNodeView, { type AgentFlowNode, type RunMark } from '../components/agent/AgentNodeView';
import { Inspector } from '../components/agent/Inspector';
import { DND_MIME, ToolExplorer } from '../components/agent/ToolExplorer';
import { RunPanel, type AgentRunView } from '../components/agent/RunPanel';
import { NlWorkspace, callsLlm, type NlTurn } from '../components/agent/NlWorkspace';
import { useTabParam } from '../lib/useDetailParam';
import type { ReferenceOpt } from '../components/agent/Inspector';
import { SharePicker, VISIBILITY_ICON, type ShareCandidate } from '../components/agent/SharePicker';
import { NODE_COLOR, NODE_HEX, NODE_ICON, nodeSummary } from '../components/agent/meta';
import styles from './agentBuilder.module.css';
import { fs } from '../lib/fontScale';
import { AGENT_NODE_LABEL, AGENT_VISIBILITY_LABEL } from '../i18n/codes';

interface Blueprint {
  id: string;
  name: string;
  description: string;
  chat?: NlTurn[];
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
  const { t } = useTranslation();
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
  const [references, setReferences] = useState<ReferenceOpt[]>([]);
  // 큰 탭 — 자연어(말로 고치고 시험 실행) | 블루프린트(노드 캔버스). 같은 그래프를 본다
  const { tab: mode, setTab: setMode } = useTabParam<'nl' | 'blueprint'>('blueprint', 'mode');
  const [turns, setTurns] = useState<NlTurn[]>([]);
  // 대화 기록을 불러온 뒤부터 바뀔 때마다 저장(조금 모았다가)
  const chatLoaded = useRef(false);
  const [working, setWorking] = useState<string | null>(null);
  const location = useLocation();

  // 참고 양식(대화로 만들 때 올린 엑셀·CSV) — '양식으로 파일 만들기' 노드에서 고른다
  useEffect(() => {
    api<ReferenceOpt[]>(`/agent-blueprints/${id}/references`)
      .then(setReferences)
      .catch(() => setReferences([]));
  }, [id]);
  const uploadReference = async (file: File): Promise<ReferenceOpt | null> => {
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = () => reject(new Error(t('agent.fileFailed')));
        r.readAsDataURL(file);
      });
      const ref = await api<ReferenceOpt>('/agent-blueprints/reference-files', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          mediaType: file.type || 'application/octet-stream',
          dataBase64,
          blueprintId: id,
        }),
      });
      setReferences((p) => [...p, { id: ref.id, name: ref.name }]);
      toast({ type: 'success', title: t('agent.formUploaded', { v0: ref.name }) });
      return ref;
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.uploadFailed') });
      return null;
    }
  };

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
        const { graph: g, chat, ...m } = bp;
        const ng = normalizeAgentGraph(g);
        setTurns(Array.isArray(chat) ? chat : []);
        chatLoaded.current = false;
        setMeta(m);
        setGraph(ng);
        setSaved(JSON.stringify({ m: [m.name, m.description, m.status], g: ng }));
        setTools(list);
        setAiConfigured(st.aiConfigured);
        setNlMode(ng.nodes.length ? 'refine' : 'new');
        setNlOpen(!ng.nodes.length);
      } catch (e) {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.loadFailed') });
        navigate('/agent-builder');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // 처음 열 때 한 번 — React Flow가 노드 크기를 다 잰 뒤(useNodesInitialized), 캔버스 크기가 잡힌 다음 화면에 맞춘다.
  // (예전엔 직접 잰 크기를 기다렸는데 조건이 맞지 않으면 끝내 맞추지 않아 빈 곳을 비췄다)
  const nodesReady = useNodesInitialized();
  const fitted = useRef<string | null>(null);
  /** 전체가 보이게 맞추되, 너무 작아져 글자를 못 읽으면(65% 미만) 그 크기로 두고 시작(왼쪽 끝)부터 보여 준다 */
  const fitNow = useCallback(() => {
    void rf.fitView({ padding: 0.15, maxZoom: 1, duration: 0 }).then(() => {
      const MIN = 0.65;
      if (rf.getZoom() >= MIN) return;
      const el = wrapRef.current;
      const b = rf.getNodesBounds(rf.getNodes());
      if (!el || !b.width) return;
      void rf.setViewport({
        x: 48 - b.x * MIN,
        y: el.clientHeight / 2 - (b.y + b.height / 2) * MIN,
        zoom: MIN,
      });
    });
  }, [rf]);
  useEffect(() => {
    if (fitted.current === id || !graph.nodes.length || !nodesReady) return;
    fitted.current = id;
    // 레이아웃(왼쪽·오른쪽 패널)이 자리 잡은 다음 프레임에
    requestAnimationFrame(() => requestAnimationFrame(fitNow));
  }, [id, graph.nodes.length, nodesReady, fitNow]);
  // 캔버스 크기가 처음 0에서 잡히면(화면 전환 직후 등) 한 번 더 맞춘다
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let sized = el.clientWidth > 0 && el.clientHeight > 0;
    const ro = new ResizeObserver(() => {
      const now = el.clientWidth > 0 && el.clientHeight > 0;
      if (now && !sized && fitted.current === id) fitNow();
      sized = now;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, fitNow]);

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
        label: t('agent.copyOf', { v0: n.label }),
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
  /** exit: 저장 버튼 — 저장되면 목록으로 나간다(⌘S는 그대로 머문다) */
  const save = useCallback(
    async (exit = false) => {
      if (!meta) return;
      if (!meta.canEdit) {
        toast({ type: 'warning', title: t('agent.ownerOnly') });
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
          title: errorCount ? t('agent.savedWithErrors', { v0: errorCount }) : t('agent.saved'),
        });
        if (exit) navigate('/agent-builder');
      } catch (e) {
        toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.saveFailed') });
      } finally {
        setSaving(false);
      }
    },
    [meta, id, graph, errorCount, toast, navigate],
  );

  // ── 복제·삭제(목록 행 끝에 있던 동작) ── 복제는 저장된 내용 기준, 누구나 / 삭제는 만든 사람만
  const duplicate = async () => {
    if (dirty && !window.confirm(t('agent.dupQ'))) return;
    try {
      const copy = await api<{ id: string }>(`/agent-blueprints/${id}/duplicate`, {
        method: 'POST',
      });
      toast({ type: 'success', title: t('agent.duplicated') });
      navigate(`/agent-builder/${copy.id}`);
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.dupFailed') });
    }
  };

  const remove = async () => {
    if (!meta?.canEdit) return;
    if (!window.confirm(t('agent.deleteQ', { v0: meta.name }))) return;
    try {
      await api(`/agent-blueprints/${id}`, { method: 'DELETE' });
      toast({ type: 'success', title: t('agent.deleted') });
      navigate('/agent-builder');
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.deleteFailed') });
    }
  };

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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.createFailed') });
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
      ...(meta.name === t('agent.newAgent') || !graph.nodes.length
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
      toast({ type: 'error', title: t('agent.fixErrorsFirst', { v0: errorCount }) });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.runFailed') });
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
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.processFailed') });
    } finally {
      setRunning(false);
    }
  };

  // ── 자연어 모드: 말로 고치기 → 바로 적용 → 시험 실행 → 오류면 AI가 다시 고치기 ──
  const say = (t: NlTurn) => setTurns((p) => [...p, t]);

  // AI 대화 기록 저장 — 처음 불러온 값은 건너뛰고, 바뀌면 잠깐 모았다가 한 번에
  useEffect(() => {
    if (loading || !meta?.canEdit) return;
    if (!chatLoaded.current) {
      chatLoaded.current = true;
      return;
    }
    const h = setTimeout(() => {
      void api(`/agent-blueprints/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ chat: turns.slice(-300) }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(h);
  }, [turns, loading]);

  /** 활성화 토글 — 바로 저장한다(다른 고친 내용은 그대로 저장 전 상태) */
  const setActive = async (on: boolean) => {
    if (!meta?.canEdit) return;
    const status = on ? 'ACTIVE' : 'DRAFT';
    const prev = meta.status;
    setMeta({ ...meta, status });
    try {
      await api(`/agent-blueprints/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setSaved((s) => {
        try {
          const o = JSON.parse(s) as { m: string[]; g: unknown };
          o.m[2] = status;
          return JSON.stringify(o);
        } catch {
          return s;
        }
      });
      toast({ type: 'success', title: on ? t('agent.activated') : t('agent.deactivated') });
    } catch (e) {
      setMeta((m) => (m ? { ...m, status: prev } : m));
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.saveFailed') });
    }
  };
  const requestFix = async (prompt: string, base: AgentGraph) => {
    const res = await api<GenerateResult>('/agent-blueprints/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        ...(base.nodes.length ? { blueprintId: id, graph: base } : {}),
      }),
    });
    commit(res.graph);
    setMeta((m) =>
      m && (m.name === t('agent.newAgent') || !base.nodes.length)
        ? { ...m, name: res.name || m.name, description: res.description || m.description }
        : m,
    );
    return res;
  };
  /** 쓰기는 하지 않고(시험) AI 노드는 흉내만 내서(비용 없음) 처음부터 끝까지 돌려 본다 */
  const testGraph = async (g: AgentGraph) => {
    const t = g.nodes.find((n) => n.type === 'trigger')?.config as TriggerConfig | undefined;
    const need = (t?.inputFields ?? []).filter((f) => f.required);
    if (need.length) return { skipped: need.map((f) => f.name) } as const;
    const r = await api<AgentRunView>(`/agent-blueprints/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input: {}, dryRun: true, mockLlm: true, graph: g }),
    });
    setRun(r);
    const bad = r.trace.filter((x) => x.status === 'error' || x.status === 'blocked');
    const failed = r.status === 'ERROR' || r.status === 'BLOCKED' || bad.length > 0;
    return {
      run: r,
      failed,
      problems: [
        ...(r.error ? [r.error] : []),
        ...bad.map((x) => `'${x.label}': ${x.message ?? x.status}`),
      ].filter((v, i, a) => a.indexOf(v) === i),
    } as const;
  };
  const verify = async (g: AgentGraph, issuesOf: AgentIssue[], autoSave: boolean) => {
    let cur = g;
    let errs = issuesOf.filter((i) => i.level === 'error');
    for (let attempt = 0; attempt < 2; attempt++) {
      if (errs.length) {
        say({
          role: 'assistant',
          test: 'fail',
          text: t('agent.chat.retryErrors', {
            v0: errs.length,
            v1: errs.map((e) => `- ${e.message}`).join('\n'),
          }),
        });
        setWorking(t('agent.working.fixErrors'));
        const res = await requestFix(
          `검사에서 이런 오류가 났습니다. 모두 고쳐 주세요:\n${errs.map((e) => `- ${e.message}`).join('\n')}`,
          cur,
        );
        cur = res.graph;
        errs = res.issues.filter((i) => i.level === 'error');
        continue;
      }
      setWorking(t('agent.working.test'));
      const tr = await testGraph(cur);
      if ('skipped' in tr) {
        say({
          role: 'assistant',
          text: t('agent.chat.skipped', { v0: tr.skipped!.join(', ') }),
        });
        return cur;
      }
      if (!tr.failed) {
        const llm = cur.nodes.filter(callsLlm).length;
        say({
          role: 'assistant',
          test: 'ok',
          text: t('agent.chat.passed', {
            v0: tr.run.trace.length,
            v1: llm,
            v2: llm ? '' : t('agent.chat.noAi'),
          }),
        });
        if (autoSave && meta?.canEdit) {
          const b = await api<Blueprint>(`/agent-blueprints/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ graph: cur }),
          });
          const ng = normalizeAgentGraph(b.graph);
          setSaved(JSON.stringify({ m: [b.name, b.description, b.status], g: ng }));
        }
        return cur;
      }
      if (attempt === 1) break;
      say({
        role: 'assistant',
        test: 'fail',
        text: t('agent.chat.testFailed', { v0: tr.problems.map((x) => `- ${x}`).join('\n') }),
      });
      setWorking(t('agent.working.fixTest'));
      const res = await requestFix(
        `시험 실행(쓰기 안 함)에서 이런 오류가 났습니다. 원인을 고친 그래프를 주세요:\n${tr.problems.map((x) => `- ${x}`).join('\n')}`,
        cur,
      );
      cur = res.graph;
      errs = res.issues.filter((i) => i.level === 'error');
    }
    say({
      role: 'assistant',
      test: 'fail',
      text: t('agent.chat.gaveUp'),
    });
    return cur;
  };
  const nlSend = async (text: string) => {
    say({ role: 'user', text });
    setWorking(graph.nodes.length ? t('agent.working.fixing') : t('agent.working.designing'));
    try {
      const res = await requestFix(text, graph);
      setMeta((m) => (m ? { ...m, prompt: text } : m));
      const ch = res.changes;
      const llm = res.graph.nodes.filter(callsLlm).length;
      say({
        role: 'assistant',
        text:
          `${res.summary}\n\n` +
          t('agent.chat.changes', {
            v0: ch.added.length,
            v1: ch.changed.length,
            v2: ch.removed.length,
            v3: llm,
          }) +
          (res.fixes.length ? `\n${res.fixes.map((f) => `- ${f}`).join('\n')}` : '') +
          t('agent.chat.unsaved'),
      });
      await verify(res.graph, res.issues, false);
    } catch (e) {
      say({
        role: 'assistant',
        test: 'fail',
        text: e instanceof ApiError ? e.message : t('agent.fixFailed'),
      });
    } finally {
      setWorking(null);
    }
  };
  const nlTest = async () => {
    setRunning(true);
    try {
      await verify(graph, issues, false);
    } catch (e) {
      say({
        role: 'assistant',
        test: 'fail',
        text: e instanceof ApiError ? e.message : t('agent.testFailed'),
      });
    } finally {
      setRunning(false);
      setWorking(null);
    }
  };
  // 대화로 막 만들고 왔으면 시험 실행·자가 수정까지 돌려 완성한다(한 번만)
  const autoTested = useRef(false);
  useEffect(() => {
    const st = location.state as { autoTest?: boolean } | null;
    if (!st?.autoTest || autoTested.current || loading || !meta || !tools) return;
    autoTested.current = true;
    navigate('.', { replace: true, state: null });
    say({
      role: 'assistant',
      text: t('agent.chat.created', { v0: meta.name }),
    });
    setRunning(true);
    void verify(graph, issues, true)
      .catch((e) =>
        say({
          role: 'assistant',
          test: 'fail',
          text: e instanceof ApiError ? e.message : t('agent.testFailed'),
        }),
      )
      .finally(() => {
        setRunning(false);
        setWorking(null);
      });
  }, [loading, meta, tools]);

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
          title={t('agent.toList')}
        >
          <ArrowLeft size={14} />
        </button>
        <input
          className={styles.nameInput}
          value={meta.name}
          onChange={(e) => setMeta({ ...meta, name: e.target.value })}
          aria-label={t('agent.agentName')}
        />
        <SegmentedControl
          className={styles.modeTabs}
          value={mode}
          onChange={(v) => {
            setMode(v as 'nl' | 'blueprint');
            if (v === 'blueprint')
              setTimeout(() => rf.fitView({ padding: 0.2, duration: 200 }), 60);
          }}
          options={[
            { value: 'nl', label: t('agent.mode.nl') },
            { value: 'blueprint', label: t('agent.mode.blueprint') },
          ]}
        />
        {dirty && <span className={styles.dirty}>{t('agent.unsaved')}</span>}
        <span className={styles.spacer} />
        {mode === 'blueprint' && (
          <>
            <button
              type="button"
              className={`${styles.iconBtn} ${leftOpen ? styles.iconBtnActive : ''}`}
              onClick={() => setLeftOpen((v) => !v)}
              title={t('agent.togglePanel')}
            >
              <PanelLeft size={14} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={undo}
              disabled={!past.length}
              title={t('agent.undo')}
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={redo}
              disabled={!future.length}
              title={t('agent.redo')}
            >
              <Redo2 size={14} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              title={t('agent.autoLayout')}
              onClick={() => {
                commit((g) => autoLayout(g));
                setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 30);
              }}
            >
              <LayoutGrid size={14} /> {t('agent.layout')}
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${showData ? styles.iconBtnActive : ''}`}
              title="데이터선({{변수}} 참조) 보이기"
              onClick={() => setShowData((v) => !v)}
            >
              <Spline size={14} /> {t('agent.dataLines')}
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className={`${styles.iconBtn} ${showIssues ? styles.iconBtnActive : ''}`}
                onClick={() => setShowIssues((v) => !v)}
                title={t('agent.checkResults')}
              >
                <CircleAlert size={14} />
                <span className={styles.issueCount}>
                  {t('agent.check')}{' '}
                  {errorCount > 0 && <span className={styles.errDot}>{errorCount}</span>}
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
                      {t('agent.noIssues')}
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
                          {i.level === 'error' ? t('agent.error') : t('agent.warning')}
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
              <Sparkles size={14} /> {t('agent.byNl')}{' '}
              {graph.nodes.length ? t('agent.edit') : t('agent.create')}
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${runOpen ? styles.iconBtnActive : ''}`}
              onClick={() => setRunOpen((v) => !v)}
            >
              <Play size={14} /> {t('agent.testRun')}
            </button>
          </>
        )}
        <span className={styles.activeToggle} title={t('agent.activeTip')}>
          <Switch
            size="sm"
            checked={meta.status === 'ACTIVE'}
            disabled={!meta.canEdit}
            onCheckedChange={(v: boolean) => void setActive(v)}
            label={t('agent.active')}
          />
        </span>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setShareOpen(true)}
          title={t('agent.whoCanUse')}
        >
          <VisIcon size={14} /> {AGENT_VISIBILITY_LABEL[meta.visibility]}
          {meta.visibility === 'SHARED' ? t('agent.nPeople', { v0: meta.shares.length }) : ''}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => void duplicate()}
          title={t('agent.copyToDraft')}
        >
          <Copy size={14} /> {t('agent.duplicate')}
        </button>
        {meta.canEdit && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void remove()}
            title={t('agent.deleteAgent')}
          >
            <Trash2 size={14} /> {t('agent.delete')}
          </button>
        )}
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!meta.canEdit}
          leftIcon={<Save size={13} />}
          onClick={() => void save(true)}
        >
          {t('agent.save')}
        </Button>
        <PopoutButton />
      </div>
      {!meta.canEdit && (
        <div className={styles.readonlyBar}>
          {meta.createdByName ?? t('agent.someone')}
          {t('agent.readonly1')}
          {t('agent.readonly2')} <b>{t('agent.duplicate')}</b>
          {t('agent.pickTool2')}
        </div>
      )}

      {/* ── 자연어 바 ── */}
      {mode === 'nl' && (
        <NlWorkspace
          graph={graph}
          description={meta.description}
          toolMap={toolMap}
          issues={issues}
          trigger={trigger}
          aiConfigured={aiConfigured}
          canEdit={meta.canEdit}
          turns={turns}
          working={working}
          run={run}
          running={running}
          onSend={(t) => void nlSend(t)}
          onTest={() => void nlTest()}
          onRun={(o) => void startRun(o)}
          onDecide={(a) => void decide(a)}
          onOpenNode={(nid) => {
            setMode('blueprint');
            setTimeout(() => focusNode(nid), 80);
          }}
        />
      )}
      {mode === 'blueprint' && nlOpen && (
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
                nlMode === 'refine' && graph.nodes.length ? t('agent.nlEditPh') : t('agent.nlNewPh')
              }
            />
            <div className={styles.nlHint}>
              {aiConfigured ? t('agent.nlHint') : t('agent.nlNoKey')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {graph.nodes.length > 0 && (
              <SegmentedControl
                size="sm"
                value={nlMode}
                onChange={(v) => setNlMode(v as 'refine' | 'new')}
                options={[
                  { value: 'refine', label: t('agent.editCurrent') },
                  { value: 'new', label: t('agent.createNew') },
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
              {nlMode === 'refine' && graph.nodes.length
                ? t('agent.makeRevision')
                : t('agent.makeBlueprint')}
            </Button>
          </div>
        </div>
      )}

      <div
        className={`${styles.body} ${leftOpen ? '' : styles.bodyNoLeft} ${mode === 'nl' ? styles.bodyHidden : ''}`}
      >
        {/* ── 왼쪽: 노드 팔레트 + 도구 탐색기 ── */}
        <aside className={styles.left} hidden={!leftOpen}>
          <div className={styles.sectionTitle}>{t('agent.nodesPalette')}</div>
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
            <div className={styles.sectionTitle}>{t('agent.toolExplorer')}</div>
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
                {t('agent.emptyCanvas')}
                <br />
                {t('agent.emptyHint1')}
                {t('agent.emptyHint2')}
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
              references={references}
              onUploadReference={meta?.canEdit ? uploadReference : undefined}
            />
          ) : (
            <div className={styles.inspector}>
              <label className={styles.label}>
                <span>{t('agent.desc')}</span>
                <textarea
                  className={styles.textarea}
                  value={meta.description}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                  placeholder={t('agent.descPh')}
                />
              </label>
              {meta.prompt && (
                <div className={styles.box}>
                  <div className={styles.boxHead}>{t('agent.lastPrompt')}</div>
                  <div className={styles.note}>{meta.prompt}</div>
                </div>
              )}
              <div className={styles.box}>
                <div className={styles.boxHead}>{t('agent.composition')}</div>
                <div className={styles.note}>
                  {t('agent.nodes')} {graph.nodes.length}
                  {t('agent.edgesSep')} {graph.edges.length}
                  {t('agent.toolsSep')} {graph.nodes.filter((n) => n.type === 'tool').length}
                  {t('agent.writesOpen')}{' '}
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
                {t('agent.help1')}
                <br />
                {t('agent.help2')}
                <br />
                {t('agent.help3')}
                <br />
                {t('agent.help4')} {'{{변수}}'}
                {t('agent.help5')}
                <br />
                {t('agent.help6')}
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
          nlMode === 'refine' && graph.nodes.length
            ? t('agent.revisionPreview')
            : t('agent.blueprintPreview')
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              {t('agent.discard')}
            </Button>
            <Button variant="primary" onClick={applyPreview}>
              {t('agent.apply')}
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
              <b className={styles.plus}>{t('agent.added')}</b>
              <span>{preview.changes.added.join(', ') || t('agent.none')}</span>
            </div>
            {graph.nodes.length > 0 && nlMode === 'refine' && (
              <>
                <div className={styles.diffRow}>
                  <b className={styles.tilde}>{t('agent.changed')}</b>
                  <span>{preview.changes.changed.join(', ') || t('agent.none')}</span>
                </div>
                <div className={styles.diffRow}>
                  <b className={styles.minus}>{t('agent.delete')}</b>
                  <span>{preview.changes.removed.join(', ') || t('agent.none')}</span>
                </div>
              </>
            )}
            <div className={styles.diffRow}>
              <b>{t('agent.edges')}</b>
              <span>
                +{preview.changes.edgesAdded} / −{preview.changes.edgesRemoved}
              </span>
            </div>
            {preview.fixes.length > 0 && (
              <div className={styles.box}>
                <div className={styles.boxHead}>{t('agent.serverFixes')}</div>
                {preview.fixes.map((f, i) => (
                  <div key={i} className={styles.note}>
                    • {f}
                  </div>
                ))}
              </div>
            )}
            {preview.issues.length > 0 && (
              <div className={styles.box}>
                <div className={styles.boxHead}>{t('agent.checkAfter')}</div>
                {preview.issues.map((i, k) => (
                  <div
                    key={k}
                    className={i.level === 'error' ? styles.errDot : styles.warnDot}
                    style={{ fontWeight: 400, fontSize: fs(12) }}
                  >
                    {i.level === 'error' ? t('agent.error') : t('agent.warning')} · {i.message}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.note}>
              {t('agent.nodes')} {preview.graph.nodes.length}
              {t('agent.tokensIn')} {preview.usage.inputTokens.toLocaleString()}
              {t('agent.cacheOpen')} {preview.usage.cacheReadTokens.toLocaleString()}
              {t('agent.outSep')} {preview.usage.outputTokens.toLocaleString()}{' '}
              {t('agent.undoNote')}
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
  const { t } = useTranslation();
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
        title: t('agent.visSaved', { v0: AGENT_VISIBILITY_LABEL[vis] }),
      });
      onSaved({ visibility: b.visibility, shares: b.shares });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : t('agent.saveFailed') });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('agent.whoTitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? t('agent.cancel') : t('agent.close')}
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              loading={saving}
              disabled={vis === 'SHARED' && ids.length === 0}
              onClick={() => void save()}
            >
              {t('agent.save')}
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
