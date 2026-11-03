/** 성과 지표 값 표시 — 원은 천 단위 쉼표, %는 소수 한 자리까지 */
export const fmtKpi = (v: number | null, unit: string) => {
  if (v === null) return '—';
  if (unit === '원') return `${Math.round(v).toLocaleString('ko-KR')}원`;
  if (unit === '%') return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
  return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
};
