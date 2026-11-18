-- 상담 콘솔 1단계 — 콜 목록(통화시간·녹취)과 고객 요청사항
ALTER TABLE "cs_call" ADD COLUMN "kat_call_sid" TEXT;
ALTER TABLE "cs_call" ADD COLUMN "duration_sec" INTEGER;
ALTER TABLE "cs_call" ADD COLUMN "ended_at" TIMESTAMPTZ(6);
ALTER TABLE "cs_call" ADD COLUMN "request" TEXT;
CREATE UNIQUE INDEX "cs_call_kat_call_sid_key" ON "cs_call"("kat_call_sid");
CREATE INDEX "cs_call_agent_emp_id_received_at_idx" ON "cs_call"("agent_emp_id", "received_at");

ALTER TABLE "lead" ADD COLUMN "customer_request" TEXT;
