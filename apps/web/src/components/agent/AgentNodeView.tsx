import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { AGENT_NODE_LABEL, hasInputPort, outputPorts, type AgentNode } from '@tongin/shared';
import { NODE_COLOR, NODE_ICON, nodeSummary } from './meta';
import styles from '../../pages/agentBuilder.module.css';

export type RunMark = 'ok' | 'dry' | 'error' | 'pending' | 'blocked' | 'skipped';

export interface AgentNodeData extends Record<string, unknown> {
  node: AgentNode;
  summary: ReturnType<typeof nodeSummary>;
  errors: number;
  warnings: number;
  run?: RunMark;
  /** 실행 기록이 있는데 이 노드는 안 지나갔다 */
  dim?: boolean;
}

export type AgentFlowNode = Node<AgentNodeData, 'agent'>;

const RUN_CLASS: Record<RunMark, string> = {
  ok: styles.runOk,
  dry: styles.runDry,
  error: styles.runErr,
  blocked: styles.runErr,
  pending: styles.runPending,
  skipped: styles.runSkip,
};

/** 블루프린트 노드 카드 — 머리(종류 색·아이콘·이름), 요약, 출력 포트 줄, 결과 변수 */
function AgentNodeView({ id, data, selected }: NodeProps<AgentFlowNode>) {
  const { node, summary } = data;
  const Icon = NODE_ICON[node.type];
  const ports = outputPorts(node);
  const portKey = ports.map((p) => p.id).join('|');
  const update = useUpdateNodeInternals();
  // 분기 갈래를 더하거나 빼면 포트 위치를 다시 잰다
  useEffect(() => {
    update(id);
  }, [id, portKey, update]);

  const cls = [
    styles.node,
    selected ? styles.nodeSelected : '',
    data.run ? RUN_CLASS[data.run] : data.dim ? styles.runSkip : '',
  ].join(' ');

  return (
    <div className={cls} style={{ ['--c' as string]: NODE_COLOR[node.type], position: 'relative' }}>
      {(data.errors > 0 || data.warnings > 0) && (
        <span
          className={`${styles.issueBadge} ${data.errors ? styles.issueErr : styles.issueWarn}`}
          title={`오류 ${data.errors} · 경고 ${data.warnings}`}
        >
          {data.errors || data.warnings}
        </span>
      )}
      {hasInputPort(node.type) && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className={`${styles.execHandle} ${styles.execHandleIn}`}
          style={{ top: 17 }}
        />
      )}
      {/* 데이터선(점선) 끝점 — 사람이 잇지는 않고 {{변수}} 참조로 그려진다 */}
      <Handle
        type="target"
        position={Position.Left}
        id="data-in"
        className={styles.dataHandle}
        style={{ top: 'auto', bottom: 10 }}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="data-out"
        className={styles.dataHandle}
        style={{ top: 'auto', bottom: 10 }}
        isConnectable={false}
      />
      <div className={styles.nodeHead}>
        <Icon size={14} />
        <span className={styles.nodeTitle}>{node.label}</span>
        <span className={styles.nodeKind}>{AGENT_NODE_LABEL[node.type]}</span>
      </div>
      <div className={styles.nodeBody}>
        {summary.mono && (
          <div
            className={`${styles.nodeLine} ${styles.nodeMono}`}
            style={{ display: 'flex', gap: 6 }}
          >
            {summary.mode && (
              <span
                className={`${styles.modeBadge} ${summary.mode === 'WRITE' ? styles.modeWrite : styles.modeRead}`}
              >
                {summary.mode === 'WRITE' ? '쓰기' : '읽기'}
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary.mono}</span>
          </div>
        )}
        {summary.lines.map((l, i) => (
          <div key={i} className={styles.nodeLine}>
            {l}
          </div>
        ))}
        {summary.outVar && <span className={styles.varPill}>→ {summary.outVar}</span>}
        {ports.length > 0 && (
          <div className={styles.ports}>
            {ports.map((p) => (
              <div key={p.id} className={styles.portRow}>
                {ports.length > 1 || p.id !== 'out' ? p.label : ''}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={p.id}
                  className={styles.execHandle}
                  style={{ right: -16 }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(AgentNodeView);
