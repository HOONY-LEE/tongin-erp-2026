-- CreateTable
CREATE TABLE "estimate_cost_buildup" (
    "estimate_id" UUID NOT NULL,
    "vehicle_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "labor_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "etc_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overhead_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "admin_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "profit_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estimate_cost_buildup_pkey" PRIMARY KEY ("estimate_id")
);

-- AddForeignKey
ALTER TABLE "estimate_cost_buildup" ADD CONSTRAINT "estimate_cost_buildup_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
