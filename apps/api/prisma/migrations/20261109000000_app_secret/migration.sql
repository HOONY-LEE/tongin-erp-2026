-- 서버가 만들어 보관하는 비밀값(예: 전화 연동 웹훅 키)
CREATE TABLE "app_secret" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_secret_pkey" PRIMARY KEY ("key")
);
