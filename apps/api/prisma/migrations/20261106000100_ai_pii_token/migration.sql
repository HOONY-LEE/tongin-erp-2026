-- AI 가명: 외부 AI에는 가명만 보내고 실제 값은 여기에 둔다(사람마다 따로)
CREATE TABLE "ai_pii_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_pii_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_pii_token_user_id_code_key" ON "ai_pii_token"("user_id", "code");

CREATE UNIQUE INDEX "ai_pii_token_user_id_value_hash_key" ON "ai_pii_token"("user_id", "value_hash");

ALTER TABLE "ai_pii_token" ADD CONSTRAINT "ai_pii_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
