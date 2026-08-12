-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "contract_id" UUID;

-- CreateIndex
CREATE INDEX "invoice_contract_id_idx" ON "invoice"("contract_id");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
