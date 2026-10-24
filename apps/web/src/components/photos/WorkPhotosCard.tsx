import { useCallback, useEffect, useState } from 'react';
import { WORK_PHOTO_KINDS, WORK_PHOTO_KIND_LABEL, type WorkPhotoMeta } from '@tongin/shared';
import { api, ApiError } from '../../lib/api';
import { Button, PageCard, Spinner } from '../ui';
import { PhotoGrid } from './PhotoGrid';

/** 관리자 작업 상세 — 현장에서 올린 사진(조회만). 종류별로 묶어 보여 준다 */
export function WorkPhotosCard({ workOrderId }: { workOrderId: string }) {
  const [photos, setPhotos] = useState<WorkPhotoMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPhotos(await api<WorkPhotoMeta[]>(`/work-orders/${workOrderId}/photos`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '사진을 불러오지 못했습니다');
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageCard
      title="현장 사진"
      count={photos?.length}
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()}>
          새로고침
        </Button>
      }
    >
      {error ? (
        <div style={{ color: 'var(--ark-color-error-600)', fontSize: 14 }}>{error}</div>
      ) : !photos ? (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <Spinner size="sm" />
        </div>
      ) : !photos.length ? (
        <div style={{ color: 'var(--ark-color-text-tertiary)', fontSize: 14 }}>
          현장에서 올린 사진이 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {WORK_PHOTO_KINDS.map((k) => {
            const list = photos.filter((p) => p.kind === k);
            if (!list.length) return null;
            return (
              <div key={k}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  {WORK_PHOTO_KIND_LABEL[k]}{' '}
                  <span style={{ color: 'var(--ark-color-text-tertiary)', fontWeight: 400 }}>
                    ({list.length})
                  </span>
                </div>
                <PhotoGrid photos={list} />
              </div>
            );
          })}
        </div>
      )}
    </PageCard>
  );
}
