-- 캠페인 받는 사람에 고객이 아닌 사람(직원·직접 입력한 시연 번호)도 담는다.
-- 고객이 아니면 customer_id가 비고, 직원이면 employee_id를 남긴다(이름·번호는 담을 때 스냅샷).
ALTER TABLE "campaign_recipient" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "campaign_recipient" ADD COLUMN "employee_id" UUID;

-- 같은 캠페인에 같은 직원은 한 번만(NULL은 서로 다르게 취급 — 고객·직접 입력 행은 영향 없음)
CREATE UNIQUE INDEX "campaign_recipient_campaign_id_employee_id_key" ON "campaign_recipient"("campaign_id", "employee_id");

-- CreateIndex
CREATE INDEX "campaign_recipient_employee_id_idx" ON "campaign_recipient"("employee_id");

-- AddForeignKey
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
