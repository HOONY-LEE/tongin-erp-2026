-- CreateTable
CREATE TABLE "service_order" (
    "id" UUID NOT NULL,
    "order_no" TEXT NOT NULL,
    "service_line" TEXT NOT NULL,
    "product_id" UUID,
    "customer_id" UUID,
    "org_unit_id" UUID NOT NULL,
    "scheduled_date" DATE,
    "address" TEXT,
    "amount" DECIMAL(14,2),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "assigned_emp_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_order_order_no_key" ON "service_order"("order_no");

-- CreateIndex
CREATE INDEX "service_order_org_unit_id_idx" ON "service_order"("org_unit_id");
