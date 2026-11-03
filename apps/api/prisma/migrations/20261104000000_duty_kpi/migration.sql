-- AlterTable
ALTER TABLE "org_unit" ADD COLUMN     "mission" TEXT;

-- AlterTable
ALTER TABLE "team_task" ADD COLUMN     "duty_id" UUID;

-- CreateTable
CREATE TABLE "duty" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_emp_id" UUID,
    "backup_emp_id" UUID,
    "cycle" TEXT NOT NULL DEFAULT 'ALWAYS',
    "tool" TEXT,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "duty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_set" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '[]',
    "actuals" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpi_set_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duty_org_unit_id_idx" ON "duty"("org_unit_id");

-- CreateIndex
CREATE INDEX "duty_owner_emp_id_idx" ON "duty"("owner_emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_set_scope_scope_id_period_key" ON "kpi_set"("scope", "scope_id", "period");

-- CreateIndex
CREATE INDEX "team_task_duty_id_idx" ON "team_task"("duty_id");

-- AddForeignKey
ALTER TABLE "team_task" ADD CONSTRAINT "team_task_duty_id_fkey" FOREIGN KEY ("duty_id") REFERENCES "duty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty" ADD CONSTRAINT "duty_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty" ADD CONSTRAINT "duty_owner_emp_id_fkey" FOREIGN KEY ("owner_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty" ADD CONSTRAINT "duty_backup_emp_id_fkey" FOREIGN KEY ("backup_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 권한: 업무 분장 정하기 — 팀 관리 그룹과 인사 수정 권한이 있는 그룹에
INSERT INTO "permission" ("id", "code", "name")
VALUES (gen_random_uuid(), 'DUTY.MANAGE', '업무 분장 · 조직 역할·업무 분장 정하기')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT DISTINCT r."id", p."id"
FROM "role" r, "permission" p
WHERE p."code" = 'DUTY.MANAGE'
  AND (r."code" = 'TEAM_MGMT' OR EXISTS (
    SELECT 1 FROM "role_permission" rp JOIN "permission" hp ON hp."id" = rp."permission_id"
    WHERE rp."role_id" = r."id" AND hp."code" = 'HR.UPDATE'))
ON CONFLICT DO NOTHING;

-- 이미 있는 메뉴 구성에 '업무 분장'은 팀 업무 뒤에, '성과 평가'는 인사·성과 뒤에 넣는다(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'tasks' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"duties"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'tasks'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"tasks"%' AND p."layout"::text NOT LIKE '%"duties"%';

UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'hr' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"performance"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'hr'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"hr"%' AND p."layout"::text NOT LIKE '%"performance"%';
