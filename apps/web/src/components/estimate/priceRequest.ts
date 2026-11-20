import i18n from '../../i18n';
/**
 * 계약이 있는 견적에서 담당자가 금액(이사비용·옵션·부가세·계약금·잔금)을 바꾸면 서버는 바로 고치지 않고
 * 결재(계약 금액 변경)를 올린 뒤 이 모양으로 답한다 — 그때 보여 줄 안내 문구(아니면 null).
 */
export function priceRequested(res: unknown): string | null {
  const r = res as { approvalRequested?: boolean; message?: string } | null;
  return r?.approvalRequested ? (r.message ?? i18n.t('est.priceRequested')) : null;
}
