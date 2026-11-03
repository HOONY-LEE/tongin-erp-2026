-- AI 관리: 사람별 에이전트 빌더 허용·막음 + Claude Models API에서 받아 둔 모델 목록
ALTER TABLE "ai_setting" ADD COLUMN "catalog" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "catalog_at" TIMESTAMPTZ(6);

ALTER TABLE "ai_user_policy" ADD COLUMN "builder_access" TEXT NOT NULL DEFAULT 'DEFAULT';
