-- 본사 계약 승인: 서명·계약금이 들어오면 접수는 '계약 미승인'(CONTRACT_PENDING), 본사가 승인하면 '계약'
ALTER TABLE "contract" ADD COLUMN "approved_at" TIMESTAMPTZ(6);
ALTER TABLE "contract" ADD COLUMN "approved_by" UUID;

-- 이미 계약 이후 단계인 접수의 계약은 승인된 것으로 본다(예전 흐름에서 자동으로 계약이 된 건)
UPDATE "contract" c
SET "approved_at" = COALESCE(c."signed_at", c."created_at")
FROM "lead" l
WHERE l."id" = c."lead_id"
  AND l."status" IN ('CONTRACTED', 'WORK_TOSS', 'IN_PROGRESS', 'DONE');
