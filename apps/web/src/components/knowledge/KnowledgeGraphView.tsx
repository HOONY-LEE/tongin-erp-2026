import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  KNOWLEDGE_CATEGORY_COLOR,
  KNOWLEDGE_CATEGORY_LABEL,
  KNOWLEDGE_CONCEPT_COLOR,
  KNOWLEDGE_CONCEPT_KIND_LABEL,
  type KnowledgeCategory,
  type KnowledgeConceptKind,
  type KnowledgeGraph,
} from '@tongin/shared';
import { useTheme } from '../../theme/ThemeProvider';
import styles from '../../pages/knowledge.module.css';

type GNode = KnowledgeGraph['nodes'][number] & { x?: number; y?: number };
type GLink = { source: string | GNode; target: string | GNode; label?: string };

const colorOf = (n: GNode) =>
  n.type === 'doc'
    ? KNOWLEDGE_CATEGORY_COLOR[n.group as KnowledgeCategory]
    : KNOWLEDGE_CONCEPT_COLOR[n.group as KnowledgeConceptKind];
const idOf = (v: string | GNode) => (typeof v === 'string' ? v : v.id);

/**
 * 옵시디언 그래프 뷰 — 문서(큰 점, 분류 색)와 개념(작은 점, 종류 색)을 힘 배치로.
 * 평소엔 은은한 점·선, 마우스를 올리거나 고르면 이어진 것만 색과 이름이 살아난다. 검색어에 맞는 점은 늘 보인다.
 */
export function KnowledgeGraphView({
  graph,
  query,
  selected,
  onSelect,
}: {
  graph: KnowledgeGraph;
  query: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const C = dark
    ? {
        node: '#c4c4cc',
        dim: '#5b5f6b',
        label: '#e4e4e7',
        labelSoft: '#a1a1aa',
        link: 'rgba(255,255,255,0.14)',
        linkOn: 'rgba(255,255,255,0.75)',
        linkOff: 'rgba(255,255,255,0.05)',
      }
    : {
        node: '#71717a',
        dim: '#c4c7ce',
        label: '#18181b',
        labelSoft: '#52525b',
        link: 'rgba(0,0,0,0.13)',
        linkOn: 'rgba(0,0,0,0.6)',
        linkOff: 'rgba(0,0,0,0.05)',
      };
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const [dim, setDim] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState<string | null>(null);

  // 그래프 데이터는 내용이 바뀔 때만 새로 만든다(점 위치가 매번 흩어지지 않게)
  const key = graph.nodes.length + ':' + graph.links.length;
  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.links.map((l) => ({ ...l })),
    }),
    [key],
  );
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graph.links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [graph]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setDim({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const f = fg.current;
    if (!f) return;
    f.d3Force('charge')?.strength(-90).distanceMax(170);
    const link = f.d3Force('link') as { distance?: (d: number) => void } | undefined;
    link?.distance?.(34);
    f.d3ReheatSimulation();
    fitted.current = false;
  }, [data]);
  // 처음 자리 잡으면 화면에 맞춘다(한 번만 — 이후 사용자가 움직인 확대·위치는 그대로)
  const fitted = useRef(false);

  const focus = hover ?? selected;
  const near = focus ? (adjacency.get(focus) ?? new Set<string>()) : null;
  const q = query.trim().toLowerCase();

  const draw = useCallback(
    (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
      const n = raw as GNode & { x: number; y: number };
      const base =
        n.type === 'doc' ? 5 + Math.min(n.degree, 20) * 0.25 : 2.2 + Math.min(n.degree, 12) * 0.25;
      const r = base;
      const color = colorOf(n);
      const isFocus = focus === n.id;
      const isNear = !!near?.has(n.id);
      const match = !!q && n.label.toLowerCase().includes(q);
      let fill = n.type === 'doc' ? color : C.node;
      let alpha = 1;
      if (focus) {
        if (isFocus || isNear) fill = color;
        else {
          fill = C.dim;
          alpha = 0.45;
        }
      }
      if (q) {
        if (match) {
          fill = color;
          alpha = 1;
        } else alpha = Math.min(alpha, 0.18);
      }
      if (isFocus) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4 / scale + 2, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;

      const showLabel =
        isFocus || isNear || match || n.type === 'doc' || scale > 2.4;
      if (showLabel) {
        const size = (isFocus ? 13 : n.type === 'doc' ? 12 : 11) / scale;
        ctx.font = `${isFocus || n.type === 'doc' ? 600 : 500} ${size}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = focus && !isFocus && !isNear && !match ? 0.25 : 1;
        ctx.fillStyle = isFocus || match ? C.label : C.labelSoft;
        const text = n.label.length > 18 ? `${n.label.slice(0, 18)}…` : n.label;
        ctx.fillText(text, n.x, n.y + r + 2 / scale);
        ctx.globalAlpha = 1;
      }
    },
    [focus, near, q, C],
  );

  const linkColor = useCallback(
    (l: object) => {
      if (!focus) return C.link;
      const x = l as GLink;
      return idOf(x.source) === focus || idOf(x.target) === focus ? C.linkOn : C.linkOff;
    },
    [focus, C],
  );

  return (
    <div className={styles.graphWrap} ref={wrap}>
      <ForceGraph2D<GNode, GLink>
        ref={fg}
        graphData={data}
        width={dim.width}
        height={dim.height}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        nodeCanvasObject={draw}
        nodePointerAreaPaint={(raw, color, ctx) => {
          const n = raw as GNode & { x: number; y: number };
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.type === 'doc' ? 9 : 6, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={(l) =>
          focus && (idOf((l as GLink).source) === focus || idOf((l as GLink).target) === focus)
            ? 1.4
            : 0.6
        }
        onNodeHover={(n) => setHover(n?.id ?? null)}
        onNodeClick={(n) => onSelect(n.id)}
        onBackgroundClick={() => onSelect(null)}
        cooldownTicks={160}
        onEngineStop={() => {
          if (fitted.current) return;
          fitted.current = true;
          fg.current?.zoomToFit(400, 60);
        }}
        d3VelocityDecay={0.3}
      />
      <div className={styles.legend}>
        {(Object.keys(KNOWLEDGE_CATEGORY_LABEL) as KnowledgeCategory[])
          .filter((k) => graph.nodes.some((n) => n.type === 'doc' && n.group === k))
          .map((k) => (
            <span key={k}>
              <i style={{ background: KNOWLEDGE_CATEGORY_COLOR[k], width: 9, height: 9 }} />
              {KNOWLEDGE_CATEGORY_LABEL[k]}
            </span>
          ))}
        <span className={styles.legendSep} />
        {(Object.keys(KNOWLEDGE_CONCEPT_KIND_LABEL) as KnowledgeConceptKind[]).map((k) => (
          <span key={k}>
            <i style={{ background: KNOWLEDGE_CONCEPT_COLOR[k] }} />
            {KNOWLEDGE_CONCEPT_KIND_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
