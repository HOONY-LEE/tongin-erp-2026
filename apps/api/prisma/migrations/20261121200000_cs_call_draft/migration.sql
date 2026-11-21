-- 상담 화면 초안(같은 고객의 다음 콜이 이어받음)
ALTER TABLE "cs_call" ADD COLUMN "draft" JSONB;
ALTER TABLE "cs_call" ADD COLUMN "draft_at" TIMESTAMPTZ(6);
CREATE INDEX "cs_call_phone_draft_at_idx" ON "cs_call"("phone", "draft_at");
