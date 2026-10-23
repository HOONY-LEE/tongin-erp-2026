-- AI가 만든 파일(엑셀·PDF·CSV·차트) 보관 + 코드 실행 컨테이너 재사용
ALTER TABLE "ai_conversation" ADD COLUMN "container_id" TEXT;

-- CreateTable
CREATE TABLE "ai_file" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool_use_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "remote_file_id" TEXT,
    "name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_file_remote_file_id_key" ON "ai_file"("remote_file_id");

-- CreateIndex
CREATE INDEX "ai_file_conversation_id_idx" ON "ai_file"("conversation_id");

-- AddForeignKey
ALTER TABLE "ai_file" ADD CONSTRAINT "ai_file_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
