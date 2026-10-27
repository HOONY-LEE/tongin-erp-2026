import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PencilRuler, Sparkles } from 'lucide-react';
import type { AgentGraph, AgentVisibility } from '@tongin/shared';
import { api, ApiError } from '../lib/api';
import { Button, useToast } from '../components/ui';
import { SharePicker } from '../components/agent/SharePicker';
import styles from './agentBuilder.module.css';

const EXAMPLES = [
  '이번 주 미계약 고객에게 재안내 문자를 보내는 에이전트. 보내기 전에 꼭 내가 승인하게 해 줘',
  '어제 들어온 접수 중 담당자가 없는 건을 찾아 지점별로 요약해 줘',
  '미수금 상위 고객 10명을 찾아 담당자에게 확인 요청 문자를 보내는 에이전트(최대 10명)',
  '새 CS 티켓이 들어오면 AI가 긴급도를 분류해서 긴급이면 담당자 배정 전에 승인을 받아',
];

interface GenerateResult {
  name: string;
  description: string;
  graph: AgentGraph;
}

/**
 * 새 에이전트 만들기(전용 화면) — 만드는 방법(자연어/직접) · 이름·설명 · 공개 범위(개인용/전체 공개/부분 공유).
 * 만들면 캔버스 편집 화면으로 간다.
 */
export default function AgentCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'nl' | 'blank'>('nl');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [visibility, setVisibility] = useState<AgentVisibility>('PRIVATE');
  const [shareIds, setShareIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ aiConfigured: boolean }>('/agent-blueprints/status')
      .then((st) => {
        setAiConfigured(st.aiConfigured);
        if (!st.aiConfigured) setMode('blank');
      })
      .catch(() => setAiConfigured(false));
  }, []);

  const canSubmit =
    !busy &&
    (mode === 'blank' || prompt.trim().length >= 2) &&
    (visibility !== 'SHARED' || shareIds.length > 0);

  const create = async () => {
    setBusy(true);
    try {
      let body: Record<string, unknown> = {
        name: name.trim() || '새 에이전트',
        description: description.trim(),
      };
      if (mode === 'nl') {
        const g = await api<GenerateResult>('/agent-blueprints/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt: prompt.trim() }),
        });
        body = {
          name: name.trim() || g.name,
          description: description.trim() || g.description,
          graph: g.graph,
          prompt: prompt.trim(),
        };
      }
      const b = await api<{ id: string }>('/agent-blueprints', {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          visibility,
          ...(visibility === 'SHARED' ? { shareEmployeeIds: shareIds } : {}),
        }),
      });
      toast({ type: 'success', title: '에이전트를 만들었습니다 — 캔버스에서 다듬어 보세요' });
      navigate(`/agent-builder/${b.id}`, { replace: true });
    } catch (e) {
      toast({ type: 'error', title: e instanceof ApiError ? e.message : '만들지 못했습니다' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.listPage}>
      <div className={styles.createPage}>
        <div className={styles.createHead}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => navigate('/agent-builder')}
            title="목록으로"
            aria-label="목록으로"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className={styles.createTitle}>새 에이전트 만들기</h1>
            <p className={styles.note}>
              ERP 도구를 실제로 호출하는 AI 에이전트를 만듭니다. 만든 뒤 캔버스에서 노드를 고치고,
              '사용중'으로 바꾸면 AI 에이전트 화면에서 불러 쓸 수 있습니다.
            </p>
          </div>
        </div>

        {/* 1. 만드는 방법 */}
        <section className={styles.createSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepNo}>1</span> 만드는 방법
          </h2>
          <div className={styles.modeCards}>
            <button
              type="button"
              className={`${styles.modeCard} ${mode === 'nl' ? styles.modeCardOn : ''}`}
              onClick={() => setMode('nl')}
              disabled={aiConfigured === false}
            >
              <Sparkles size={18} />
              <b>자연어로 만들기</b>
              <span>하고 싶은 일을 말하면 Claude가 노드·분기·승인까지 설계합니다.</span>
            </button>
            <button
              type="button"
              className={`${styles.modeCard} ${mode === 'blank' ? styles.modeCardOn : ''}`}
              onClick={() => setMode('blank')}
            >
              <PencilRuler size={18} />
              <b>직접 만들기</b>
              <span>빈 캔버스에서 시작·도구·분기·가드레일 노드를 직접 잇습니다.</span>
            </button>
          </div>
          {aiConfigured === false && (
            <div className={styles.warnNote}>
              서버에 ANTHROPIC_API_KEY가 없어 자연어로 만들기는 쓸 수 없습니다. 직접 만들기는 그대로
              됩니다.
            </div>
          )}
        </section>

        {/* 2. 내용 */}
        <section className={styles.createSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepNo}>2</span> 무엇을 하는 에이전트인가요
          </h2>
          {mode === 'nl' && (
            <>
              <label className={styles.field}>
                하고 싶은 일 *
                <textarea
                  className={styles.textarea}
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="대상·조건·하는 일·승인이나 한도 같은 규칙을 말해 주세요."
                />
              </label>
              <div className={styles.examples}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className={styles.chip}
                    onClick={() => setPrompt(ex)}
                  >
                    {ex.length > 40 ? `${ex.slice(0, 39)}…` : ex}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className={styles.twoCols}>
            <label className={styles.field}>
              이름 {mode === 'nl' && <span className={styles.note}>(비우면 AI가 지어 줍니다)</span>}
              <input
                className={styles.input}
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 미계약 고객 재안내"
              />
            </label>
            <label className={styles.field}>
              설명 {mode === 'nl' && <span className={styles.note}>(비우면 AI가 씁니다)</span>}
              <input
                className={styles.input}
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="AI 에이전트 화면에 보이는 한 줄 설명"
              />
            </label>
          </div>
        </section>

        {/* 3. 공개 범위 */}
        <section className={styles.createSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepNo}>3</span> 누가 쓸 수 있나요
          </h2>
          <SharePicker
            visibility={visibility}
            shareIds={shareIds}
            onChange={(v) => {
              setVisibility(v.visibility);
              setShareIds(v.shareIds);
            }}
          />
          <div className={styles.note}>
            공개 범위는 나중에 편집 화면의 '공유'에서 바꿀 수 있습니다. 고치기·지우기는 만든 사람만
            할 수 있고, 다른 사람은 복제해서 씁니다.
          </div>
        </section>

        <div className={styles.createFooter}>
          <Button variant="ghost" disabled={busy} onClick={() => navigate('/agent-builder')}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!canSubmit}
            leftIcon={mode === 'nl' ? <Sparkles size={14} /> : undefined}
            onClick={() => void create()}
          >
            {mode === 'nl' ? (busy ? '설계하는 중…' : '자연어로 만들기') : '빈 캔버스로 시작'}
          </Button>
        </div>
      </div>
    </div>
  );
}
