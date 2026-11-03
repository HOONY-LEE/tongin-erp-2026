import { useEffect, useState } from 'react';
import { AI_MODELS, type AiModelDef } from '@tongin/shared';
import { cachedApi } from './api';

/** 받아 둔 모델 이름(id → 이름) — 노드 카드 요약처럼 훅을 못 쓰는 곳에서 쓴다 */
const labels = new Map<string, string>(AI_MODELS.map((m) => [m.id, m.label]));
export const aiModelLabel = (id: string) => labels.get(id) ?? id;

/**
 * 고를 수 있는 AI 모델 — 서버가 Claude Models API에서 받아 둔 목록(이 사용자에게 열린 것은 enabled).
 * 받기 전·실패하면 코드의 기본 목록.
 */
export function useAiModels() {
  const [models, setModels] = useState<AiModelDef[]>(() =>
    AI_MODELS.map((m) => ({ ...m, lifecycle: 'active' as const, createdAt: null })),
  );
  useEffect(() => {
    let alive = true;
    cachedApi<{ models: AiModelDef[] }>('/ai/status')
      .then((s) => {
        if (!alive || !s.models?.length) return;
        for (const m of s.models) labels.set(m.id, m.label);
        setModels(s.models);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return models;
}
