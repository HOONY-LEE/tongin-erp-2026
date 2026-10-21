-- AlterTable
ALTER TABLE "estimate" ADD COLUMN     "balance_amount" DECIMAL(14,2),
ADD COLUMN     "deposit_amount" DECIMAL(14,2),
ADD COLUMN     "move_amount" DECIMAL(14,2),
ADD COLUMN     "vat_amount" DECIMAL(14,2),
ADD COLUMN     "vat_mode" TEXT NOT NULL DEFAULT 'EXCLUDED';

-- CreateTable
CREATE TABLE "estimate_addon" (
    "id" UUID NOT NULL,
    "estimate_id" UUID NOT NULL,
    "addon_service_id" UUID,
    "name" TEXT NOT NULL,
    "qty" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_addon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_addon_estimate_id_idx" ON "estimate_addon"("estimate_id");

-- AddForeignKey
ALTER TABLE "estimate_addon" ADD CONSTRAINT "estimate_addon_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_addon" ADD CONSTRAINT "estimate_addon_addon_service_id_fkey" FOREIGN KEY ("addon_service_id") REFERENCES "addon_service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
