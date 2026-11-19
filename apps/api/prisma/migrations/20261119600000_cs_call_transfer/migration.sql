-- 돌려주기: 콜에 넘긴 곳·시각, 돌려주기 연락처 목록
ALTER TABLE "cs_call" ADD COLUMN "transfer_to" TEXT;
ALTER TABLE "cs_call" ADD COLUMN "transferred_at" TIMESTAMPTZ(6);

CREATE TABLE "cs_transfer_target" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_transfer_target_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_transfer_target_sort_order_idx" ON "cs_transfer_target"("sort_order");
