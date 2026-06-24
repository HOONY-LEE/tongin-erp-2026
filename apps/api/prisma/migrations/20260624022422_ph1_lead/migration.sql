-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "lead_no" TEXT NOT NULL,
    "customer_id" UUID,
    "org_unit_id" UUID NOT NULL,
    "owner_emp_id" UUID,
    "partner_id" UUID,
    "source" TEXT,
    "service_line" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "from_zipcode" TEXT,
    "from_addr" TEXT,
    "to_zipcode" TEXT,
    "to_addr" TEXT,
    "move_date" DATE,
    "visit_date" DATE,
    "expected_amount" DECIMAL(14,2),
    "attributes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_lead_no_key" ON "lead"("lead_no");

-- CreateIndex
CREATE INDEX "lead_status_idx" ON "lead"("status");

-- CreateIndex
CREATE INDEX "lead_org_unit_id_idx" ON "lead"("org_unit_id");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_emp_id_fkey" FOREIGN KEY ("owner_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
