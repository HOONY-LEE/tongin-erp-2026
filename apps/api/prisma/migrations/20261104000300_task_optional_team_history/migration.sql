-- 작업관리: 팀은 골라도 되고 안 골라도 된다(담당자와 따로) + 담당 넘기기·상태 변경 이력
ALTER TABLE "team_task" DROP CONSTRAINT "team_task_team_org_id_fkey";
ALTER TABLE "team_task" ALTER COLUMN "team_org_id" DROP NOT NULL;
ALTER TABLE "team_task" ADD CONSTRAINT "team_task_team_org_id_fkey" FOREIGN KEY ("team_org_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "team_task_event" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "note" TEXT,
    "actor_user_id" UUID,
    "actor_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_task_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "team_task_event_task_id_created_at_idx" ON "team_task_event"("task_id", "created_at");
ALTER TABLE "team_task_event" ADD CONSTRAINT "team_task_event_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "team_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 지금 있는 업무는 '만듦' 한 줄씩(만든 시각) — 이력이 빈칸으로 시작하지 않게
INSERT INTO "team_task_event" ("id", "task_id", "kind", "to_value", "actor_user_id", "created_at")
SELECT gen_random_uuid(), t."id", 'CREATED', t."assignee_emp_id"::text, t."created_by_user_id", t."created_at"
FROM "team_task" t;
