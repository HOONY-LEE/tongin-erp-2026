import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Repeat, Sparkles, X, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../ui';
import styles from '../../pages/agentBuilder.module.css';

export interface HabitSuggestion {
  id: string;
  kind: 'routine' | 'reaction' | 'sequence';
  title: string;
  reason: string;
  count: number;
  days: number;
  lastAt: string;
  trigger: { kind: 'schedule' | 'event' | 'manual'; label: string };
  prompt: string;
  actions: string[];
}

const KIND = {
  routine: { label: '정해진 시간', Icon: CalendarClock },
  reaction: { label: '이벤트 뒤 대응', Icon: Zap },
  sequence: { label: '이어서 하는 일', Icon: Repeat },
} as const;

/** 숨긴 제안 — 사람(계정)별·브라우저별 편의 설정 */
const hiddenKey = (userId: string) => `agentBuilder.hiddenHabits.${userId}`;
const readHidden = (userId: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(hiddenKey(userId)) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/**
 * 반복 행동 → 에이전트 제안 — 최근 30일 동안 손으로 되풀이한 일을 보여 주고,
 * 「에이전트로 만들기」를 누르면 만들기 대화에 그 내용을 첫 요청으로 넣어 시작한다.
 */
export function HabitSuggestions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.userId ?? '';
  const [items, setItems] = useState<HabitSuggestion[]>([]);
  const [hidden, setHidden] = useState<string[]>(() => readHidden(userId));

  useEffect(() => {
    api<HabitSuggestion[]>('/agent-suggestions')
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const hide = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(hiddenKey(userId), JSON.stringify(next));
    } catch {
      // 저장이 막힌 브라우저에선 이번 화면에서만 숨긴다
    }
  };

  const shown = items.filter((s) => !hidden.includes(s.id));
  if (!shown.length) return null;

  return (
    <section className={styles.habits} aria-label="반복 작업 제안">
      <header className={styles.habitsHead}>
        <Sparkles size={16} aria-hidden />
        <b>자주 반복하는 일, 에이전트에게 맡겨 볼까요?</b>
        <span className={styles.habitsMeta}>최근 30일 동안 직접 한 일에서 찾았어요</span>
      </header>
      <div className={styles.habitGrid}>
        {shown.map((s) => {
          const { label, Icon } = KIND[s.kind];
          return (
            <article key={s.id} className={styles.habitCard}>
              <div className={styles.habitTop}>
                <span className={styles.habitKind}>
                  <Icon size={13} aria-hidden />
                  {label}
                </span>
                <button
                  type="button"
                  className={styles.habitHide}
                  title="이 제안 숨기기"
                  aria-label="이 제안 숨기기"
                  onClick={() => hide(s.id)}
                >
                  <X size={14} />
                </button>
              </div>
              <b className={styles.habitTitle}>{s.title}</b>
              <p className={styles.habitReason}>{s.reason}</p>
              <div className={styles.habitFoot}>
                <span className={styles.habitTrigger}>시작: {s.trigger.label}</span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate('/agent-builder/new', { state: { prompt: s.prompt } })}
                >
                  에이전트로 만들기
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
