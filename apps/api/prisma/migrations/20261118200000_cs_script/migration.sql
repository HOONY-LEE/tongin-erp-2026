-- 상담 콘솔 대본 메모 — 상담원마다 여러 개(인사·견적 안내·제휴 안내 등), 상담 중에 골라 본다
CREATE TABLE "cs_script" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cs_script_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_script_employee_id_sort_order_idx" ON "cs_script"("employee_id", "sort_order");
