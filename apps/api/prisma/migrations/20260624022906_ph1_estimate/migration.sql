-- CreateTable
CREATE TABLE "estimate" (
    "id" UUID NOT NULL,
    "estimate_no" TEXT NOT NULL,
    "lead_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "estimator_emp_id" UUID,
    "from_addr" TEXT,
    "from_pyeong" INTEGER,
    "from_elevator" BOOLEAN,
    "to_addr" TEXT,
    "to_pyeong" INTEGER,
    "to_elevator" BOOLEAN,
    "total_cbm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(14,2),
    "total_amount" DECIMAL(14,2),
    "work_instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_zone" (
    "id" UUID NOT NULL,
    "estimate_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_line" (
    "id" UUID NOT NULL,
    "estimate_id" UUID NOT NULL,
    "zone_id" UUID,
    "cbm_item_id" UUID,
    "item_name" TEXT NOT NULL,
    "qty" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "cbm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "handling" TEXT NOT NULL DEFAULT 'CARRY',
    "memo" TEXT,

    CONSTRAINT "estimate_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_estimate_no_key" ON "estimate"("estimate_no");

-- CreateIndex
CREATE INDEX "estimate_lead_id_idx" ON "estimate"("lead_id");

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_estimator_emp_id_fkey" FOREIGN KEY ("estimator_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_zone" ADD CONSTRAINT "estimate_zone_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_line" ADD CONSTRAINT "estimate_line_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_line" ADD CONSTRAINT "estimate_line_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "estimate_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_line" ADD CONSTRAINT "estimate_line_cbm_item_id_fkey" FOREIGN KEY ("cbm_item_id") REFERENCES "cbm_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
