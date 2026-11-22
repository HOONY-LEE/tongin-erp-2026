-- 중복 접수 잇기 — 같은 출발지·서비스 요청일로 먼저 들어온 접수를 가리킨다
ALTER TABLE "lead" ADD COLUMN "dup_of_lead_id" UUID;
ALTER TABLE "lead" ADD CONSTRAINT "lead_dup_of_lead_id_fkey" FOREIGN KEY ("dup_of_lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- 접수할 때 같은 출발지·요청일 찾기
CREATE INDEX "lead_from_addr_move_date_idx" ON "lead"("from_addr", "move_date");
