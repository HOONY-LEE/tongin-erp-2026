-- CreateTable
CREATE TABLE "commission_rule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "org_unit_id" UUID,
    "service_line" TEXT,
    "source" TEXT,
    "calc_type" TEXT NOT NULL,
    "rate" DECIMAL(6,4),
    "fixed_amount" DECIMAL(14,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "commission_rule" ADD CONSTRAINT "commission_rule_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
