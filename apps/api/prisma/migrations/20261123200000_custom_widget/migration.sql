-- 위젯 스튜디오 — 관리자가 만든 위젯(설계서만 저장). 대시보드 배치에서는 widget = 'cw:' + id
CREATE TABLE "custom_widget" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "spec" JSONB NOT NULL,
    "prompt" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_widget_pkey" PRIMARY KEY ("id")
);
