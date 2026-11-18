-- 이사일 마감(지점별)과 이사 확인콜·해피콜 기록(2026-11-18)
CREATE TABLE "move_closure" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "org_unit_id" UUID,
    "memo" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "move_closure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "move_closure_date_idx" ON "move_closure"("date");

CREATE TABLE "cs_followup" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "memo" TEXT,
    "employee_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_followup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_followup_lead_id_kind_idx" ON "cs_followup"("lead_id", "kind");
