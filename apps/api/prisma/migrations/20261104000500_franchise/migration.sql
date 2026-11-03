-- 가맹: 가맹점 계약 정보 · 가맹 영업 CRM(가맹점 모집) · 상담 기록
-- CreateTable
CREATE TABLE "franchise_info" (
    "org_unit_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPERATING',
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "biz_no" TEXT,
    "contract_start" DATE,
    "contract_end" DATE,
    "franchise_fee" DECIMAL(14,0),
    "fee_paid_at" DATE,
    "deposit" DECIMAL(14,0),
    "deposit_paid_at" DATE,
    "royalty" DECIMAL(14,0),
    "memo" TEXT,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "franchise_info_pkey" PRIMARY KEY ("org_unit_id")
);

-- CreateTable
CREATE TABLE "franchise_lead" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "region" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DB',
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "interest" TEXT NOT NULL DEFAULT 'B',
    "owner_emp_id" UUID,
    "next_action_at" DATE,
    "next_action" TEXT,
    "current_biz" TEXT,
    "memo" TEXT,
    "lost_reason" TEXT,
    "branch_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "franchise_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franchise_lead_activity" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT,
    "from_stage" TEXT,
    "to_stage" TEXT,
    "actor_user_id" UUID,
    "actor_name" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "franchise_lead_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "franchise_lead_stage_idx" ON "franchise_lead"("stage");

-- CreateIndex
CREATE INDEX "franchise_lead_owner_emp_id_idx" ON "franchise_lead"("owner_emp_id");

-- CreateIndex
CREATE INDEX "franchise_lead_activity_lead_id_at_idx" ON "franchise_lead_activity"("lead_id", "at");

-- AddForeignKey
ALTER TABLE "franchise_info" ADD CONSTRAINT "franchise_info_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_lead" ADD CONSTRAINT "franchise_lead_owner_emp_id_fkey" FOREIGN KEY ("owner_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_lead" ADD CONSTRAINT "franchise_lead_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_lead_activity" ADD CONSTRAINT "franchise_lead_activity_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "franchise_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 권한: 가맹 — 가맹팀 업무 그룹에 전부, 경영관리팀 업무 그룹에 조회
INSERT INTO "permission" ("id", "code", "name") VALUES
  (gen_random_uuid(), 'FRANCHISE.READ', '가맹 · 조회'),
  (gen_random_uuid(), 'FRANCHISE.CREATE', '가맹 · 등록'),
  (gen_random_uuid(), 'FRANCHISE.UPDATE', '가맹 · 수정'),
  (gen_random_uuid(), 'FRANCHISE.DELETE', '가맹 · 삭제')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "role" r, "permission" p
WHERE r."code" = 'TEAM_FRANCHISE' AND p."code" LIKE 'FRANCHISE.%'
ON CONFLICT DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "role" r, "permission" p
WHERE r."code" = 'TEAM_MGMT' AND p."code" = 'FRANCHISE.READ'
ON CONFLICT DO NOTHING;

-- 메뉴 구성: 지점관리가 든 묶음 맨 앞에 '가맹점 현황'·'가맹 영업'을 넣는다(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'branches'
      THEN jsonb_set(g, '{items}', '["franchise","franchise-leads"]'::jsonb || (g->'items'))
      ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"branches"%' AND p."layout"::text NOT LIKE '%"franchise"%';
-- 가맹팀 구성의 '가맹 관리' 묶음 이름은 '가맹'으로
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(CASE WHEN g->>'label' = '가맹 관리' THEN jsonb_set(g, '{label}', '"가맹"') ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"가맹 관리"%';
