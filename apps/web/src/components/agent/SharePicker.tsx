import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { SearchInput } from '../../components/ui/SearchInput';
import { Globe2, Lock, Users, X } from 'lucide-react';
import {
  AGENT_VISIBILITY_HINT,
  AGENT_VISIBILITY_LABEL,
  type AgentVisibility,
} from '@tongin/shared';
import { api } from '../../lib/api';
import { Checkbox, SegmentedControl } from '../ui';
import styles from './share.module.css';

export interface ShareCandidate {
  id: string;
  name: string;
  orgUnitName: string;
  positionName: string | null;
}

export const VISIBILITY_ICON: Record<AgentVisibility, typeof Lock> = {
  PRIVATE: Lock,
  PUBLIC: Globe2,
  SHARED: Users,
};

/**
 * 에이전트 공개 범위 고르기 — 개인용 / 전체 공개 / 부분 공유.
 * 부분 공유면 로그인 계정이 있는 직원 목록에서 이름·지점·직책으로 찾아 체크한다.
 */
export function SharePicker({
  visibility,
  shareIds,
  onChange,
  disabled,
  known = [],
}: {
  visibility: AgentVisibility;
  shareIds: string[];
  onChange: (v: { visibility: AgentVisibility; shareIds: string[] }) => void;
  disabled?: boolean;
  /** 이미 공유된 직원 정보(목록을 불러오기 전에도 이름을 보여 주려고) */
  known?: ShareCandidate[];
}) {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<ShareCandidate[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (visibility !== 'SHARED' || candidates) return;
    api<ShareCandidate[]>('/agent-blueprints/share-candidates')
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [visibility, candidates]);

  const selected = useMemo(() => new Set(shareIds), [shareIds]);
  const byId = useMemo(
    () => new Map([...known, ...(candidates ?? [])].map((c) => [c.id, c])),
    [known, candidates],
  );
  const shown = useMemo(() => {
    const k = q.trim();
    const list = candidates ?? [];
    if (!k) return list;
    return list.filter((c) =>
      [c.name, c.orgUnitName, c.positionName ?? ''].some((s) => s.includes(k)),
    );
  }, [candidates, q]);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange({ visibility, shareIds: [...next] });
  };
  const allShownOn = shown.length > 0 && shown.every((c) => selected.has(c.id));
  const toggleShown = () => {
    const next = new Set(selected);
    for (const c of shown) {
      if (allShownOn) next.delete(c.id);
      else next.add(c.id);
    }
    onChange({ visibility, shareIds: [...next] });
  };

  return (
    <div className={styles.wrap}>
      <SegmentedControl
        size="md"
        value={visibility}
        onChange={(v) => !disabled && onChange({ visibility: v as AgentVisibility, shareIds })}
        options={(['PRIVATE', 'PUBLIC', 'SHARED'] as const).map((v) => ({
          value: v,
          label: AGENT_VISIBILITY_LABEL[v],
          disabled,
        }))}
      />
      <span className={styles.hint}>{AGENT_VISIBILITY_HINT[visibility]}</span>

      {visibility === 'SHARED' && (
        <div className={styles.picker}>
          <div className={styles.chips}>
            {shareIds.length === 0 ? (
              <span className={styles.hint}>{t('ai.share.none')}</span>
            ) : (
              shareIds.map((id) => {
                const c = byId.get(id);
                return (
                  <span key={id} className={styles.chip}>
                    {c ? c.name : '…'}
                    {c?.positionName && <small>{c.positionName}</small>}
                    {!disabled && (
                      <button
                        type="button"
                        aria-label={t('ai.removeOf', { v0: c?.name ?? '' })}
                        onClick={() => toggle(id, false)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                );
              })
            )}
          </div>
          {!disabled && (
            <>
              <div className={styles.searchRow}>
                <SearchInput
                  value={q}
                  onChange={setQ}
                  placeholder={t('ai.share.searchPh')}
                  ariaLabel={t('ai.share.search')}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={toggleShown}
                  disabled={!shown.length}
                >
                  {allShownOn
                    ? t('ai.share.removeAll')
                    : t('ai.share.addAll', { v0: shown.length })}
                </button>
              </div>
              <div className={styles.list} role="list">
                {candidates === null ? (
                  <span className={styles.hint}>{t('ai.share.loading')}</span>
                ) : shown.length === 0 ? (
                  <span className={styles.hint}>{t('ai.share.noMatch')}</span>
                ) : (
                  shown.map((c) => (
                    <label key={c.id} className={styles.item} role="listitem">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={(v) => toggle(c.id, v === true)}
                      />
                      <span className={styles.itemName}>{c.name}</span>
                      <span className={styles.itemMeta}>
                        {[c.positionName, c.orgUnitName].filter(Boolean).join(' · ')}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <span className={styles.hint}>
                {shareIds.length}
                {t('ai.share.note1')}
                {t('ai.share.note2')}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
