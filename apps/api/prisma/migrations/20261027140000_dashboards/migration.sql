-- 대시보드 템플릿·개인 대시보드 + 템플릿 지정(권한 그룹/사용자)
CREATE TABLE "dashboard" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "layout" JSONB NOT NULL DEFAULT '{"version":1,"items":[]}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "allow_personal" BOOLEAN NOT NULL DEFAULT true,
    "owner_user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "dashboard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dashboard_owner_user_id_key" ON "dashboard"("owner_user_id");

CREATE TABLE "dashboard_assignment" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboard_assignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dashboard_assignment_target_type_target_id_key" ON "dashboard_assignment"("target_type", "target_id");
CREATE INDEX "dashboard_assignment_dashboard_id_idx" ON "dashboard_assignment"("dashboard_id");
ALTER TABLE "dashboard_assignment" ADD CONSTRAINT "dashboard_assignment_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
