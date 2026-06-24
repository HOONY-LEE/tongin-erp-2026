-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL,
    "contract_no" TEXT NOT NULL,
    "estimate_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "contract_date" DATE,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "deposit_ratio" DECIMAL(5,2) NOT NULL DEFAULT 0.1,
    "deposit_amount" DECIMAL(14,2) NOT NULL,
    "balance_amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB,
    "signed_at" TIMESTAMPTZ(6),
    "esign_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'VIRTUAL_ACCOUNT',
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pg_provider" TEXT NOT NULL DEFAULT 'TOSS',
    "pg_ref" TEXT,
    "virtual_account" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_contract_no_key" ON "contract"("contract_no");

-- CreateIndex
CREATE UNIQUE INDEX "contract_estimate_id_key" ON "contract"("estimate_id");

-- CreateIndex
CREATE INDEX "payment_contract_id_idx" ON "payment"("contract_id");

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
