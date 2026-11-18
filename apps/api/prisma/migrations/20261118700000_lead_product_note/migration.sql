-- 접수의 상품 특이사항(제휴·전속 혜택·조건) — 접수 때 업체 내용을 옮겨 둔다(2026-11-18)
ALTER TABLE "lead" ADD COLUMN "product_note" TEXT;
