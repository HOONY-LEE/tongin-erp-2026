-- CreateTable
CREATE TABLE "estimate_cost_line" (
    "id" UUID NOT NULL,
    "estimate_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deducted_at" TIMESTAMPTZ(6),
    "stock_movement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_cost_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_cost_line_estimate_id_idx" ON "estimate_cost_line"("estimate_id");

-- AddForeignKey
ALTER TABLE "estimate_cost_line" ADD CONSTRAINT "estimate_cost_line_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_cost_line" ADD CONSTRAINT "estimate_cost_line_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
