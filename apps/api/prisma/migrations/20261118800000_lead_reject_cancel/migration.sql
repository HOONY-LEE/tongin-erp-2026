-- 지점 반려(본사로 되돌림)와 접수 취소의 형태·사유(2026-11-18)
ALTER TABLE "lead" ADD COLUMN "reject_kind" TEXT;
ALTER TABLE "lead" ADD COLUMN "reject_reason" TEXT;
ALTER TABLE "lead" ADD COLUMN "rejected_at" TIMESTAMPTZ(6);
ALTER TABLE "lead" ADD COLUMN "rejected_from_org_id" UUID;
ALTER TABLE "lead" ADD COLUMN "cancel_kind" TEXT;
ALTER TABLE "lead" ADD COLUMN "cancel_reason" TEXT;
