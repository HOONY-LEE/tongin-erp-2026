-- 화면 번호(시스템이 매김) — 작업관리 T-12, 영업 CRM F000012·B000012. 기존 행은 만든 순서대로 번호를 준다
ALTER TABLE "team_task" ADD COLUMN "seq" SERIAL;
UPDATE "team_task" t SET "seq" = o.n
FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n FROM "team_task") o
WHERE t."id" = o."id";
SELECT setval(pg_get_serial_sequence('"team_task"', 'seq'), GREATEST((SELECT COALESCE(MAX("seq"), 0) FROM "team_task"), 1), (SELECT COUNT(*) > 0 FROM "team_task"));
CREATE UNIQUE INDEX "team_task_seq_key" ON "team_task"("seq");

ALTER TABLE "crm_lead" ADD COLUMN "seq" SERIAL;
UPDATE "crm_lead" t SET "seq" = o.n
FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n FROM "crm_lead") o
WHERE t."id" = o."id";
SELECT setval(pg_get_serial_sequence('"crm_lead"', 'seq'), GREATEST((SELECT COALESCE(MAX("seq"), 0) FROM "crm_lead"), 1), (SELECT COUNT(*) > 0 FROM "crm_lead"));
CREATE UNIQUE INDEX "crm_lead_seq_key" ON "crm_lead"("seq");
