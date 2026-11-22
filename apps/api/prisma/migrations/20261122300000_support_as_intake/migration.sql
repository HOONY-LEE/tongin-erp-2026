-- A/S 접수 — 고객·접수(견적건)에 잇고, 담당 지점은 거기서 따른다. 접수 유형은 공통 코드(AS_CATEGORY)
ALTER TABLE "support_ticket" ADD COLUMN "category" TEXT;
ALTER TABLE "support_ticket" ADD COLUMN "lead_id" UUID;
ALTER TABLE "support_ticket" ALTER COLUMN "org_unit_id" DROP NOT NULL;
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "support_ticket_customer_id_idx" ON "support_ticket"("customer_id");
CREATE INDEX "support_ticket_lead_id_idx" ON "support_ticket"("lead_id");

-- 접수 유형 기본값
INSERT INTO "common_code" ("id", "code_group", "code", "name", "sort_order", "is_active") VALUES
  (gen_random_uuid(), 'AS_CATEGORY', 'CONSULT', '상담 관련', 1, true),
  (gen_random_uuid(), 'AS_CATEGORY', 'WORK', '작업 관련', 2, true),
  (gen_random_uuid(), 'AS_CATEGORY', 'COST', '비용 관련', 3, true),
  (gen_random_uuid(), 'AS_CATEGORY', 'ETC', '기타 문의', 4, true)
ON CONFLICT ("code_group", "code") DO NOTHING;
