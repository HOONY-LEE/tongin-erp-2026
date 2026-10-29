import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
}

const EVENT = 'tongin:inbox-changed';
/** 다른 화면(결재·업무)에서 알림 상태가 바뀌었을 때 벨을 바로 다시 읽게 한다 */
export const pokeInbox = () => window.dispatchEvent(new Event(EVENT));

/**
 * 내 알림 — 30초마다 다시 읽는다. 탭이 가려져 있으면 쉬고, 다시 보이면 바로 읽는다.
 */
export function useInbox(enabled: boolean) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!enabled || document.hidden) return;
    try {
      const r = await api<{ items: InboxItem[]; unread: number }>('/me/notifications?take=30');
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* 네트워크 실패는 다음 차례에 */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    const onPoke = () => void load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(EVENT, onPoke);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(EVENT, onPoke);
    };
  }, [load]);

  const markRead = useCallback(
    async (ids?: string[]) => {
      const now = new Date().toISOString();
      setItems((cur) =>
        cur.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
      );
      try {
        const r = await api<{ unread: number }>('/me/notifications/read', {
          method: 'POST',
          body: JSON.stringify(ids ? { ids } : {}),
        });
        setUnread(r.unread);
      } catch {
        void load();
      }
    },
    [load],
  );

  const clearRead = useCallback(async () => {
    setItems((cur) => cur.filter((n) => !n.readAt));
    try {
      await api('/me/notifications/clear', { method: 'POST', body: '{}' });
    } catch {
      void load();
    }
  }, [load]);

  return { items, unread, markRead, clearRead, reload: load };
}
