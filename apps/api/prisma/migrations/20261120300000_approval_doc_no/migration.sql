-- 결재 문서 번호도 같은 규칙으로: AP + YYMMDD + 날짜별 일련 4자리. 예전 번호(AP-2026-0001)는 legacy_no로
ALTER TABLE "approval_doc" ADD COLUMN IF NOT EXISTS "legacy_no" TEXT;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, submitted_at FROM approval_doc ORDER BY submitted_at, id LOOP
    UPDATE approval_doc SET legacy_no = doc_no, doc_no = next_doc_no('AP', (r.submitted_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
END $$;
