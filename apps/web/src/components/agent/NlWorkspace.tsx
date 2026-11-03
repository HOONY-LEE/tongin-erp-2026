import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, CheckCircle2, CircleAlert, Cpu, Play, Wrench } from 'lucide-react';
import {
  AGENT_NODE_LABEL,
  type AgentGraph,
  type AgentIssue,
  type AgentNode,
  type AgentToolInfo,
  type BranchConfig,
  type TriggerConfig,
} from '@tongin/shared';
import { Badge, Button } from '../ui';
import { Markdown } from '../ai/Markdown';
import { NODE_ICON, NODE_COLOR, nodeSummary } from './meta';
import { RunPanel, type AgentRunView } from './RunPanel';
import styles from '../../pages/agentBuilder.module.css';
import ai from '../../pages/aiAgent.module.css';

export interface NlTurn {
  role: 'user' | 'assistant';
  text: string;
  /** 시험 실행 결과 줄 */
  test?: 'ok' | 'fail';
}

/** 이 노드가 실행될 때 AI(LLM)를 부르는지 — 블루프린트는 도구·조건·반복은 알고리즘으로, 판단만 AI로 */
export const callsLlm = (n: AgentNode) =>
  n.type === 'llm' || (n.type === 'branch' && (n.config as BranchConfig).mode === 'classify');

/** 시작 노드부터 실행선을 따라간 순서(분기·반복 포함, 이어지지 않은 노드는 뒤에) */
function executionOrder(g: AgentGraph): AgentNode[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out: AgentNode[] = [];
  const seen = new Set<string>();
  const queue = g.nodes.filter((n) => n.type === 'trigger').map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id)!);
    for (const e of g.edges.filter((x) => x.source === id)) queue.push(e.target);
  }
  return [...out, ...g.nodes.filter((n) => !seen.has(n.id))];
}

interface Props {
  graph: AgentGraph;
  description: string;
  toolMap: Map<string, AgentToolInfo>;
  issues: AgentIssue[];
  trigger: TriggerConfig | null;
  aiConfigured: boolean;
  canEdit: boolean;
  turns: NlTurn[];
  working: string | null;
  run: AgentRunView | null;
  running: boolean;
  onSend: (text: string) => void;
  onTest: () => void;
  onRun: (opts: { input: Record<string, unknown>; dryRun: boolean; mockLlm: boolean }) => void;
  onDecide: (approve: boolean) => void;
  onOpenNode: (id: string) => void;
}

/**
 * 자연어 모드 — 말로 고치고(왼쪽 대화) 지금 에이전트가 하는 일을 단계 목록으로 본다(오른쪽).
 * 고친 뒤에는 시험 실행(쓰기 안 함·AI 흉내)을 자동으로 돌려 오류가 나면 AI에게 다시 고치게 한다.
 * 블루프린트 모드(노드 캔버스)와 같은 그래프를 본다.
 */
export function NlWorkspace(p: Props) {
  const [draft, setDraft] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => executionOrder(p.graph), [p.graph]);
  const llmSteps = steps.filter(callsLlm);
  const errors = p.issues.filter((i) => i.level === 'error');
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [p.turns, p.working]);

  const send = () => {
    const t = draft.trim();
    if (!t || p.working) return;
    setDraft('');
    p.onSend(t);
  };

  return (
    <div className={styles.nlWork}>
      <div className={`${ai.main} ${styles.nlChat}`}>
        <div className={ai.scroll} aria-live="polite">
          <div className={ai.thread}>
            <div className={ai.aiMsg}>
              <Markdown
                text={
                  p.graph.nodes.length
                    ? '바꾸고 싶은 점을 말씀해 주세요. 고친 뒤에는 제가 **시험 실행**까지 돌려 보고, 오류가 나면 스스로 다시 고칩니다.\n노드를 직접 다듬으려면 위의 **블루프린트**로 넘어가세요.'
                    : '어떤 일을 하는 에이전트인지 말씀해 주세요. 설계하고 시험 실행까지 해 볼게요.'
                }
              />
            </div>
            {p.turns.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className={ai.userTurn}>
                  <div className={ai.userMsg}>{m.text}</div>
                </div>
              ) : (
                <div
                  key={i}
                  className={`${ai.aiMsg} ${m.test ? (m.test === 'ok' ? styles.nlOk : styles.nlFail) : ''}`}
                >
                  <Markdown text={m.text} />
                </div>
              ),
            )}
            {p.working && (
              <div className={ai.working} role="status">
                <span className={ai.spark} aria-hidden />
                {p.working}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
        <div className={ai.composerWrap}>
          <div className={`${ai.composer} ${!p.canEdit || !p.aiConfigured ? ai.composerOff : ''}`}>
            <textarea
              className={ai.input}
              rows={1}
              value={draft}
              placeholder={
                !p.aiConfigured
                  ? 'ANTHROPIC_API_KEY가 없어 말로 고칠 수 없습니다 — 블루프린트에서 직접 고쳐 주세요'
                  : !p.canEdit
                    ? '보기 전용입니다 — 복제한 뒤 고칠 수 있습니다'
                    : '예: 대상이 없으면 나에게 알려 주고, 문자는 30명까지만 보내게 해 줘'
              }
              disabled={!p.canEdit || !p.aiConfigured}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="에이전트 고치기 대화"
            />
            <div className={ai.composerBar}>
              <span className={ai.barLeft} />
              <button
                type="button"
                className={ai.sendBtn}
                onClick={send}
                disabled={!draft.trim() || !!p.working}
                aria-label="보내기"
              >
                <ArrowUp size={20} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className={styles.nlSide}>
        <div className={styles.nlSideHead}>
          <b>지금 에이전트가 하는 일</b>
          {p.description && <span className={styles.note}>{p.description}</span>}
          <div className={styles.nlStats}>
            <span>
              <Wrench size={12} /> 도구·규칙 {steps.length - llmSteps.length}단계
            </span>
            <span className={llmSteps.length ? styles.nlLlm : ''}>
              <Cpu size={12} /> AI 호출 {llmSteps.length}곳
            </span>
            {errors.length > 0 ? (
              <span className={styles.nlErr}>
                <CircleAlert size={12} /> 오류 {errors.length}
              </span>
            ) : (
              p.graph.nodes.length > 0 && (
                <span className={styles.nlGood}>
                  <CheckCircle2 size={12} /> 검사 통과
                </span>
              )
            )}
          </div>
          <span className={styles.note}>
            도구·조건·반복은 정해진 대로 돌아 AI를 부르지 않습니다. AI는 판단이 필요한 곳에서만
            부릅니다.
          </span>
        </div>
        <ol className={styles.nlSteps}>
          {steps.map((n, i) => {
            const Icon = NODE_ICON[n.type];
            const s = nodeSummary(n, p.toolMap);
            const err = p.issues.find((x) => x.nodeId === n.id && x.level === 'error');
            return (
              <li key={n.id}>
                <button type="button" className={styles.nlStep} onClick={() => p.onOpenNode(n.id)}>
                  <span className={styles.nlNum}>{i + 1}</span>
                  <span className={styles.nlIcon} style={{ color: NODE_COLOR[n.type] }}>
                    <Icon size={13} />
                  </span>
                  <span className={styles.nlBody}>
                    <span className={styles.nlTitle}>
                      {n.label}
                      {callsLlm(n) ? (
                        <Badge variant="subtle" size="sm" color="primary">
                          <Bot size={10} /> AI 판단
                        </Badge>
                      ) : (
                        <span className={styles.note}>{AGENT_NODE_LABEL[n.type]}</span>
                      )}
                      {s.mode === 'WRITE' && (
                        <Badge variant="subtle" size="sm" color="warning">
                          쓰기
                        </Badge>
                      )}
                    </span>
                    <span className={styles.note}>{s.mono ?? s.lines[0] ?? ''}</span>
                    {err && <span className={styles.nlErrText}>{err.message}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {!steps.length && <li className={styles.note}>아직 단계가 없습니다.</li>}
        </ol>
        <div className={styles.nlTestBar}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Play size={13} />}
            loading={p.running}
            disabled={!p.graph.nodes.length || !!p.working}
            onClick={p.onTest}
          >
            시험 실행
          </Button>
          <button type="button" className={styles.linkBtn} onClick={() => setTestOpen((v) => !v)}>
            {testOpen ? '자세히 닫기' : '입력값·실제 실행 옵션'}
          </button>
        </div>
        {(testOpen || p.run) && (
          <div className={styles.nlRun}>
            <RunPanel
              trigger={p.trigger}
              run={p.run}
              running={p.running}
              aiConfigured={p.aiConfigured}
              onRun={p.onRun}
              onDecide={p.onDecide}
              onSelectNode={p.onOpenNode}
              onClose={() => setTestOpen(false)}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
