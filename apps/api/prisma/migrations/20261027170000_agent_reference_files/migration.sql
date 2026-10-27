-- 에이전트 실행에서 만든 파일도 보관(대화 대신 실행에 붙는다)
ALTER TABLE "ai_file" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "ai_file" ADD COLUMN "agent_run_id" UUID;
CREATE INDEX "ai_file_agent_run_id_idx" ON "ai_file"("agent_run_id");
ALTER TABLE "ai_file" ADD CONSTRAINT "ai_file_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 에이전트 참고 양식 파일
CREATE TABLE "agent_reference_file" (
    "id" UUID NOT NULL,
    "blueprint_id" UUID,
    "name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "structure" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_reference_file_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_reference_file_blueprint_id_idx" ON "agent_reference_file"("blueprint_id");
ALTER TABLE "agent_reference_file" ADD CONSTRAINT "agent_reference_file_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "agent_blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
