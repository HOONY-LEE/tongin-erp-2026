-- 상담 콘솔 문자 — 템플릿(공유/개인)과 보낸 기록(2026-11-19)
CREATE TABLE "cs_sms_template" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "shared" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_sms_template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_sms_template_shared_sort_order_idx" ON "cs_sms_template"("shared", "sort_order");

CREATE TABLE "cs_sms" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "customer_id" UUID,
    "call_id" UUID,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "reason" TEXT,
    "vendor" TEXT,
    "employee_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_sms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_sms_customer_id_at_idx" ON "cs_sms"("customer_id", "at");
CREATE INDEX "cs_sms_phone_at_idx" ON "cs_sms"("phone", "at");
