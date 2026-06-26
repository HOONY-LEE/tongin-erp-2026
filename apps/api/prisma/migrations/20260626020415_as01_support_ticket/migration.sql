-- CreateTable
CREATE TABLE "support_ticket" (
    "id" UUID NOT NULL,
    "ticket_no" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "customer_id" UUID,
    "contract_id" UUID,
    "org_unit_id" UUID NOT NULL,
    "channel" TEXT,
    "subject" TEXT NOT NULL,
    "content" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "assignee_emp_id" UUID,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_ticket_no_key" ON "support_ticket"("ticket_no");

-- CreateIndex
CREATE INDEX "support_ticket_org_unit_id_idx" ON "support_ticket"("org_unit_id");
