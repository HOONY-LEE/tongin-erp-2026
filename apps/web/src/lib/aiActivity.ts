import { useEffect, useSyncExternalStore } from 'react';
import { api, getToken } from './api';

/**
 * AI 에이전트가 지금 일하는 중인 대화 — 앱 어디서든(헤더 탭·사이드바 메뉴·대화 목록) 같은 값을 본다.
 * 에이전트는 서버에서 계속 돌기 때문에, 다른 화면에 있어도 진행 중 표시가 남도록 가볍게 폴링한다
 * (진행 중이면 3초, 아니면 20초). AI 화면은 목록을 읽을 때마다 report()로 바로 알려 준다.
 */
interface Row {
  id: string;
  status: string;
}

let runningIds: string[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;

const emit = () => listeners.forEach((l) => l());

/** 대화 목록을 받으면 진행 중인 대화를 갱신한다 */
export function reportAiRows(rows: Row[]) {
  const next = rows.filter((r) => r.status === 'RUNNING').map((r) => r.id);
  const changed = next.length !== runningIds.length || next.some((id, i) => id !== runningIds[i]);
  runningIds = next;
  if (changed) emit();
  schedule();
}

async function poll() {
  timer = null;
  if (!subscribers || !getToken()) return;
  try {
    reportAiRows(await api<Row[]>('/ai/conversations'));
  } catch {
    schedule();
  }
}

function schedule(delay?: number) {
  if (!subscribers) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void poll(), delay ?? (runningIds.length ? 3000 : 20000));
}

/** 방금 일을 시켰다 — 바로 다시 읽어 표시를 켠다 */
export function pokeAiActivity() {
  schedule(300);
}

/** 진행 중인 대화 id 목록 (enabled=false면 폴링하지 않고 빈 목록) */
export function useAiRunning(enabled: boolean): string[] {
  useEffect(() => {
    if (!enabled) return;
    subscribers += 1;
    schedule(0);
    return () => {
      subscribers -= 1;
      if (!subscribers && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [enabled]);
  const ids = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => runningIds,
  );
  return enabled ? ids : EMPTY;
}
const EMPTY: string[] = [];
