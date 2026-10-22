-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '새 대화',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "pending" JSONB,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_call" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool_use_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversation_user_id_updated_at_idx" ON "ai_conversation"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_tool_call_conversation_id_idx" ON "ai_tool_call"("conversation_id");

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_call" ADD CONSTRAINT "ai_tool_call_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

