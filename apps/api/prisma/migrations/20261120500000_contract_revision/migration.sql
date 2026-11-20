-- 계약서 수정 이력
-- CreateTable
CREATE TABLE "contract_revision" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "doc_bytes" BYTEA,
    "doc_key" TEXT,
    "by_emp_id" UUID,
    "by_name" TEXT,
    "approval_doc_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_revision_contract_id_seq_key" ON "contract_revision"("contract_id", "seq");

-- AddForeignKey
ALTER TABLE "contract_revision" ADD CONSTRAINT "contract_revision_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

