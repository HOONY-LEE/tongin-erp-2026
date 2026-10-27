-- 에이전트 공개 범위 + 부분 공유 대상 직원
ALTER TABLE "agent_blueprint" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';
-- 이미 있던 에이전트는 지금처럼 모두가 보던 것이라 전체 공개로 둔다
UPDATE "agent_blueprint" SET "visibility" = 'PUBLIC';

CREATE TABLE "agent_blueprint_share" (
    "blueprint_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_blueprint_share_pkey" PRIMARY KEY ("blueprint_id","employee_id")
);
CREATE INDEX "agent_blueprint_share_employee_id_idx" ON "agent_blueprint_share"("employee_id");
ALTER TABLE "agent_blueprint_share" ADD CONSTRAINT "agent_blueprint_share_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "agent_blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_blueprint_share" ADD CONSTRAINT "agent_blueprint_share_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
