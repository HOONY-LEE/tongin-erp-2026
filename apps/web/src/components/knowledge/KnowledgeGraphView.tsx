import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { KnowledgeGraph } from '@tongin/shared';
import { useTheme } from '../../theme/ThemeProvider';
import styles from '../../pages/knowledge.module.css';
import { useTranslation } from 'react-i18next';

type GNode = KnowledgeGraph['nodes'][number] & { x?: number; y?: number };
type GLink = { source: string | GNode; target: string | GNode; label?: string };

const idOf = (v: string | GNode) => (typeof v === 'string' ? v : v.id);

/**
 * 옵시디언 그래프 뷰 — 모든 점은 같은 회색(문서는 크게, 개념은 작게), 이어진 수만큼 조금씩 커진다.
 * 마우스를 올리거나 고르면 그 점과 이어진 것만 강조색으로, 나머지는 흐리게. 검색어에 맞는 점도 강조색.
 * 처음에 미리 자리를 잡아 두고 보여 줘서 화면에서 크게 출렁이지 않는다.
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
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const C = dark
    ? {
        node: '#8b8b94',
        doc: '#b4b4bc',
        accent: '#a78bfa',
        dim: '#3f424b',
        label: '#e4e4e7',
        labelSoft: '#a1a1aa',
        link: 'rgba(255,255,255,0.14)',
        linkOn: 'rgba(255,255,255,0.75)',
        linkOff: 'rgba(255,255,255,0.05)',
      }
    : {
        node: '#a1a1aa',
        doc: '#71717a',
        accent: '#7c3aed',
        dim: '#d9dbe0',
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
    f.d3Force('charge')?.strength(-140).distanceMax(320);
    const link = f.d3Force('link') as { distance?: (d: number) => void } | undefined;
    link?.distance?.(55);
    f.d3ReheatSimulation();
    fitted.current = false;
    // 자리 잡는 동안 화면에 맞춰 둔다(멈춘 뒤 한 번 더)
    const tm = setTimeout(() => fg.current?.zoomToFit(300, 50), 700);
    return () => clearTimeout(tm);
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
      const color = C.accent;
      const isFocus = focus === n.id;
      const isNear = !!near?.has(n.id);
      const match = !!q && n.label.toLowerCase().includes(q);
      let fill = n.type === 'doc' ? C.doc : C.node;
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
        ctx.fillStyle = `${color}2e`;
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;

      // 이름 — 문서·강조된 점은 늘, 개념은 확대할수록 서서히(옵시디언처럼)
      const fade =
        n.type === 'doc'
          ? Math.max(0, Math.min(1, (scale - 0.9) / 0.6))
          : Math.max(0, Math.min(1, (scale - 3) / 1.5));
      const showLabel = isFocus || isNear || match || fade > 0;
      if (showLabel) {
        const size = (isFocus ? 13 : n.type === 'doc' ? 12 : 11) / scale;
        ctx.font = `${isFocus || n.type === 'doc' ? 600 : 500} ${size}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = isFocus || isNear || match ? 1 : focus ? 0.2 : fade;
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
        warmupTicks={120}
        cooldownTicks={60}
        d3AlphaDecay={0.05}
        onEngineStop={() => {
          if (fitted.current) return;
          fitted.current = true;
          fg.current?.zoomToFit(400, 60);
        }}
        d3VelocityDecay={0.6}
      />
      <div className={styles.legend}>
        <span>
          <i style={{ background: C.doc, width: 9, height: 9 }} />
          {t('know.graphDoc')}
        </span>
        <span>
          <i style={{ background: C.node }} />
          {t('know.graphConcept')}
        </span>
      </div>
    </div>
  );
}
