import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
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
  routine: { label: i18n.t('ai.habit.SCHEDULE'), Icon: CalendarClock },
  reaction: { label: i18n.t('ai.habit.EVENT'), Icon: Zap },
  sequence: { label: i18n.t('ai.habit.SEQUENCE'), Icon: Repeat },
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
  const { t } = useTranslation();
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
    <section className={styles.habits} aria-label={t('ai.habit.aria')}>
      <header className={styles.habitsHead}>
        <Sparkles size={16} aria-hidden />
        <b>{t('ai.habit.title')}</b>
        <span className={styles.habitsMeta}>{t('ai.habit.sub')}</span>
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
                  title={t('ai.habit.hide')}
                  aria-label={t('ai.habit.hide')}
                  onClick={() => hide(s.id)}
                >
                  <X size={14} />
                </button>
              </div>
              <b className={styles.habitTitle}>{s.title}</b>
              <p className={styles.habitReason}>{s.reason}</p>
              <div className={styles.habitFoot}>
                <span className={styles.habitTrigger}>
                  {t('ai.habit.start')} {s.trigger.label}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate('/agent-builder/new', { state: { prompt: s.prompt } })}
                >
                  {t('ai.habit.make')}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
