-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'ALIMTALK',
    "event_type" TEXT NOT NULL,
    "recipient" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "payload" JSONB,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_event_type_idx" ON "notification"("event_type");
