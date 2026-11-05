-- CreateTable
CREATE TABLE "telephony_line" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telephony_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_log" (
    "id" UUID NOT NULL,
    "line_id" UUID,
    "provider" TEXT NOT NULL,
    "external_id" TEXT,
    "from_number" TEXT NOT NULL,
    "to_number" TEXT,
    "extension" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RINGING',
    "customer_id" UUID,
    "answered_by_user_id" UUID,
    "lead_id" UUID,
    "memo" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "call_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telephony_line_token_key" ON "telephony_line"("token");

-- CreateIndex
CREATE INDEX "call_log_started_at_idx" ON "call_log"("started_at");

-- CreateIndex
CREATE INDEX "call_log_from_number_idx" ON "call_log"("from_number");

-- CreateIndex
CREATE UNIQUE INDEX "call_log_provider_external_id_key" ON "call_log"("provider", "external_id");

-- AddForeignKey
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "telephony_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
