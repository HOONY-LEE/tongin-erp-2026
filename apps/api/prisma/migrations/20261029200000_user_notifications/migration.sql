-- 팀 업무 댓글(멘션)
CREATE TABLE "team_task_comment" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_emp_id" UUID,
    "author_user_id" UUID,
    "body" TEXT NOT NULL,
    "mentions" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_task_comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "team_task_comment_task_id_created_at_idx" ON "team_task_comment"("task_id", "created_at");
ALTER TABLE "team_task_comment" ADD CONSTRAINT "team_task_comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "team_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 내 알림
CREATE TABLE "user_notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "actor_user_id" UUID,
    "actor_name" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_notification_user_id_created_at_idx" ON "user_notification"("user_id", "created_at");
CREATE INDEX "user_notification_user_id_read_at_idx" ON "user_notification"("user_id", "read_at");
