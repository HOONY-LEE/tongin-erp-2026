-- 휴가 신청서에서 기본으로 넣었던 '휴가 중 연락처' 항목을 뺀다(관리자가 따로 더한 항목은 그대로)
UPDATE "approval_form"
SET "fields" = COALESCE(
  (SELECT jsonb_agg(f) FROM jsonb_array_elements("fields"::jsonb) f WHERE f->>'id' IS DISTINCT FROM 'contact'),
  '[]'::jsonb
)
WHERE "kind" = 'LEAVE'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements("fields"::jsonb) f WHERE f->>'id' = 'contact');
