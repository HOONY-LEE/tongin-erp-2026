-- 캠페인 상세화 (2026-10-22): 채널별 설정(장문 제목·광고 표기·알림톡 템플릿/버튼/대체발송), 예약 발송, 받는 사람 건별 기록
-- AlterTable
ALTER TABLE "campaign" ADD COLUMN     "buttons" JSONB,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "failed_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fallback_sms" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "filters" JSONB,
ADD COLUMN     "is_ad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opt_out_text" TEXT,
ADD COLUMN     "scheduled_at" TIMESTAMPTZ(6),
ADD COLUMN     "sent_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "template_code" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "campaign_recipient" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "campaign_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_recipient_customer_id_idx" ON "campaign_recipient"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipient_campaign_id_customer_id_key" ON "campaign_recipient"("campaign_id", "customer_id");

-- AddForeignKey
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 이미 보낸 캠페인은 받은 수를 성공 수로
UPDATE "campaign" SET "sent_count" = "recipient_count" WHERE "status" = 'SENT';
