-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMPTZ(6),
    "due_date" DATE,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_receipt" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'TRANSFER',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,

    CONSTRAINT "invoice_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_invoice_no_key" ON "invoice"("invoice_no");

-- CreateIndex
CREATE INDEX "invoice_partner_id_idx" ON "invoice"("partner_id");

-- CreateIndex
CREATE INDEX "invoice_receipt_invoice_id_idx" ON "invoice_receipt"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_receipt" ADD CONSTRAINT "invoice_receipt_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
