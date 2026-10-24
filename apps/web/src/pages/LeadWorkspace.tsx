import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { PageSkeleton } from '../components/ui';
import EstimateDetail from './EstimateDetail';

/**
 * 접수 상세 — 접수와 견적을 한 화면으로. 그 접수의 견적을 열고, 없으면 바로 만들어서 연다.
 * (접수 정보는 견적의 1. 기본정보에, 진행은 위 진행 줄에 모여 있다)
 */
export default function LeadWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEstimateId(null);
    setError(null);
    api<{ estimateId: string }>(`/estimates/for-lead/${id}`, { method: 'POST' })
      .then((r) => setEstimateId(r.estimateId))
      .catch((e) => setError(e instanceof ApiError ? e.message : '접수를 열지 못했습니다'));
  }, [id]);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ark-color-text-secondary)' }}>
        {error}
      </div>
    );
  }
  if (!estimateId) {
    return (
      <div style={{ padding: 4 }}>
        <PageSkeleton />
      </div>
    );
  }
  return <EstimateDetail key={estimateId} estimateId={estimateId} />;
}
