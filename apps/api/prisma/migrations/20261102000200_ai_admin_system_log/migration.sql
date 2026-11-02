-- AI 관리(모델·사용자별 권한·사용량 기록) + 시스템 로그(경고·오류)
CREATE TABLE "ai_setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "allowed" TEXT[],
    "default_model" TEXT NOT NULL,
    "prices" JSONB NOT NULL DEFAULT '{}',
    "monthly_token_limit" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    CONSTRAINT "ai_setting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_user_policy" (
    "user_id" UUID NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'DEFAULT',
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monthly_token_limit" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ai_user_policy_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "ai_usage_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "ref_id" TEXT,
    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_log_created_at_idx" ON "ai_usage_log"("created_at");
CREATE INDEX "ai_usage_log_user_id_created_at_idx" ON "ai_usage_log"("user_id", "created_at");

CREATE TABLE "system_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "context" TEXT,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "method" TEXT,
    "path" TEXT,
    "status" INTEGER,
    "user_id" UUID,
    "ref" TEXT,
    CONSTRAINT "system_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "system_log_created_at_idx" ON "system_log"("created_at");
CREATE INDEX "system_log_level_created_at_idx" ON "system_log"("level", "created_at");
CREATE INDEX "system_log_ref_idx" ON "system_log"("ref");
