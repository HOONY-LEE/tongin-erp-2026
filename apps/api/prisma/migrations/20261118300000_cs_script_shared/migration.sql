-- 상담 메모 — 공유(상담 콘솔 모든 직원이 봄) / 개인
ALTER TABLE "cs_script" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "cs_script_shared_sort_order_idx" ON "cs_script"("shared", "sort_order");
