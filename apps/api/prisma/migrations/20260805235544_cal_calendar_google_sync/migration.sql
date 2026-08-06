-- CreateTable
CREATE TABLE "calendar_event" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "color" TEXT NOT NULL DEFAULT '#FF3B30',
    "location" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "owner_user_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "google_event_id" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_link" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "google_email" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_expiry" TIMESTAMPTZ(6),
    "scope" TEXT,
    "calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_token" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "google_calendar_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_event_date_idx" ON "calendar_event"("date");

-- CreateIndex
CREATE INDEX "calendar_event_owner_user_id_date_idx" ON "calendar_event"("owner_user_id", "date");

-- CreateIndex
CREATE INDEX "calendar_event_org_unit_id_date_idx" ON "calendar_event"("org_unit_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_owner_user_id_google_event_id_key" ON "calendar_event"("owner_user_id", "google_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_link_user_id_key" ON "google_calendar_link"("user_id");

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_link" ADD CONSTRAINT "google_calendar_link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
