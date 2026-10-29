-- 겸직(추가 소속) — TF·프로젝트팀처럼 주 소속 외의 조직에도 함께 속한다
CREATE TABLE "employee_concurrent_org" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "position_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_concurrent_org_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_concurrent_org_employee_id_org_unit_id_key" ON "employee_concurrent_org"("employee_id", "org_unit_id");
CREATE INDEX "employee_concurrent_org_org_unit_id_idx" ON "employee_concurrent_org"("org_unit_id");

ALTER TABLE "employee_concurrent_org" ADD CONSTRAINT "employee_concurrent_org_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_concurrent_org" ADD CONSTRAINT "employee_concurrent_org_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_concurrent_org" ADD CONSTRAINT "employee_concurrent_org_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
