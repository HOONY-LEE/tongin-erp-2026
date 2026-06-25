-- CreateTable
CREATE TABLE "material_order" (
    "id" UUID NOT NULL,
    "order_no" TEXT NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "shipped_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_order_line" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "stock_movement_id" UUID,

    CONSTRAINT "material_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_order_order_no_key" ON "material_order"("order_no");

-- CreateIndex
CREATE INDEX "material_order_org_unit_id_idx" ON "material_order"("org_unit_id");

-- CreateIndex
CREATE INDEX "material_order_line_order_id_idx" ON "material_order_line"("order_id");

-- AddForeignKey
ALTER TABLE "material_order" ADD CONSTRAINT "material_order_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_order_line" ADD CONSTRAINT "material_order_line_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "material_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_order_line" ADD CONSTRAINT "material_order_line_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
