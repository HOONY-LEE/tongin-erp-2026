-- 결재 첨부파일(양식의 '첨부파일' 항목) — 작성 중에 올리고, 상신하면 문서에 붙는다
CREATE TABLE "approval_attachment" (
    "id" UUID NOT NULL,
    "doc_id" UUID,
    "uploaded_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_attachment_doc_id_idx" ON "approval_attachment"("doc_id");
CREATE INDEX "approval_attachment_uploaded_by_user_id_created_at_idx" ON "approval_attachment"("uploaded_by_user_id", "created_at");

ALTER TABLE "approval_attachment" ADD CONSTRAINT "approval_attachment_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "approval_doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
