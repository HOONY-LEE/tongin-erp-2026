-- 현장 작업 사진(작업 전·후, 파손·하자) — 데모 규모라 내용은 DB(bytea)에 둔다
-- CreateTable
CREATE TABLE "work_photo" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "caption" TEXT,
    "media_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BYTEA NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_photo_work_order_id_created_at_idx" ON "work_photo"("work_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "work_photo" ADD CONSTRAINT "work_photo_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_photo" ADD CONSTRAINT "work_photo_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
