-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "org_unit_id" UUID;

-- CreateIndex
CREATE INDEX "invoice_org_unit_id_idx" ON "invoice"("org_unit_id");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
