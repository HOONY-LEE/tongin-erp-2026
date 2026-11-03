-- 영업 CRM 공통 틀(파이프라인) — 가맹 영업(FRANCHISE)을 옮기고 기업영업(B2B)을 더한다
-- CreateTable
CREATE TABLE "crm_lead" (
    "id" UUID NOT NULL,
    "pipeline" TEXT NOT NULL DEFAULT 'FRANCHISE',
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "region" TEXT,
    "source" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "interest" TEXT NOT NULL DEFAULT 'B',
    "owner_emp_id" UUID,
    "amount" DECIMAL(14,0),
    "expected_at" DATE,
    "next_action_at" DATE,
    "next_action" TEXT,
    "memo" TEXT,
    "lost_reason" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "branch_id" UUID,
    "partner_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crm_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activity" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT,
    "from_stage" TEXT,
    "to_stage" TEXT,
    "actor_user_id" UUID,
    "actor_name" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_lead_pipeline_stage_idx" ON "crm_lead"("pipeline", "stage");

-- CreateIndex
CREATE INDEX "crm_lead_owner_emp_id_idx" ON "crm_lead"("owner_emp_id");

-- CreateIndex
CREATE INDEX "crm_activity_lead_id_at_idx" ON "crm_activity"("lead_id", "at");

-- AddForeignKey
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_owner_emp_id_fkey" FOREIGN KEY ("owner_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 가맹 영업 기록을 새 표로 옮긴다(지금 하는 사업은 fields로)
INSERT INTO "crm_lead" ("id","pipeline","company_name","contact_name","phone","region","source","stage","interest","owner_emp_id","next_action_at","next_action","memo","lost_reason","fields","branch_id","created_by_user_id","created_at","updated_at")
SELECT "id",'FRANCHISE',"company_name","contact_name","phone","region","source","stage","interest","owner_emp_id","next_action_at","next_action","memo","lost_reason",
       CASE WHEN "current_biz" IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('currentBiz', "current_biz") END,
       "branch_id","created_by_user_id","created_at","updated_at"
FROM "franchise_lead";
INSERT INTO "crm_activity" ("id","lead_id","kind","content","from_stage","to_stage","actor_user_id","actor_name","at")
SELECT "id","lead_id","kind","content","from_stage","to_stage","actor_user_id","actor_name","at" FROM "franchise_lead_activity";
DROP TABLE "franchise_lead_activity";
DROP TABLE "franchise_lead";

-- 권한: 기업영업 CRM — '기업영업팀 업무' 그룹을 만들어 기업영업 부서 계정에 붙인다
INSERT INTO "permission" ("id", "code", "name") VALUES
  (gen_random_uuid(), 'B2B_CRM.READ', '기업영업 CRM · 조회'),
  (gen_random_uuid(), 'B2B_CRM.CREATE', '기업영업 CRM · 등록'),
  (gen_random_uuid(), 'B2B_CRM.UPDATE', '기업영업 CRM · 수정'),
  (gen_random_uuid(), 'B2B_CRM.DELETE', '기업영업 CRM · 삭제')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role" ("id", "code", "name", "description")
SELECT gen_random_uuid(), 'TEAM_B2B', '기업영업팀 업무', '기업영업 CRM(리드·실사·견적·수주)'
WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'TEAM_B2B');
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "role" r, "permission" p
WHERE r."code" = 'TEAM_B2B' AND p."code" LIKE 'B2B_CRM.%'
ON CONFLICT DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "role" r, "permission" p
WHERE r."code" = 'TEAM_MGMT' AND p."code" = 'B2B_CRM.READ'
ON CONFLICT DO NOTHING;
-- 기업영업 부서(하위 포함 아님 — 바로 속한) 직원 계정에 붙인다
INSERT INTO "user_role" ("id", "user_id", "role_id", "data_scope")
SELECT gen_random_uuid(), u."id", r."id", 'ALL'
FROM "app_user" u
JOIN "employee" e ON e."id" = u."employee_id"
JOIN "org_unit" o ON o."id" = e."org_unit_id"
JOIN "role" r ON r."code" = 'TEAM_B2B'
WHERE o."code" = 'DEPT-B2B' AND e."is_active"
  AND NOT EXISTS (SELECT 1 FROM "user_role" x WHERE x."user_id" = u."id" AND x."role_id" = r."id");

-- 메뉴 구성: '기업 영업' 묶음(또는 접수가 든 묶음 중 기업영업팀) 맨 앞에 '기업영업 CRM'
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->>'label' = '기업 영업'
      THEN jsonb_set(g, '{items}', '["b2b-crm"]'::jsonb || (g->'items'))
      ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"기업 영업"%' AND p."layout"::text NOT LIKE '%"b2b-crm"%';
