-- 견적서 보내기 → 고객 서명 → 계약금 자동 입금확인
ALTER TABLE "contract" ADD COLUMN "sign_token" TEXT;
ALTER TABLE "contract" ADD COLUMN "sign_token_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "contract" ADD COLUMN "signature_image" TEXT;
ALTER TABLE "contract" ADD COLUMN "signer_name" TEXT;
ALTER TABLE "contract" ADD COLUMN "sent_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "contract_sign_token_key" ON "contract"("sign_token");

ALTER TABLE "payment" ADD COLUMN "pg_secret" TEXT;
ALTER TABLE "payment" ADD COLUMN "due_at" TIMESTAMPTZ(6);
