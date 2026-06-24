-- CreateTable
CREATE TABLE "work_order" (
    "id" UUID NOT NULL,
    "work_no" TEXT NOT NULL,
    "contract_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "partner_id" UUID,
    "scheduled_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "billed_cost" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_assignment" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "employee_id" UUID,
    "resource_type" TEXT NOT NULL,
    "resource_ref" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_work_no_key" ON "work_order"("work_no");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_contract_id_key" ON "work_order"("contract_id");

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_assignment" ADD CONSTRAINT "work_assignment_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_assignment" ADD CONSTRAINT "work_assignment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
