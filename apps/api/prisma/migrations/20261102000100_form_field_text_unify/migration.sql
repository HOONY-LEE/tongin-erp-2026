-- 결재 양식 항목 종류 정리 — '한 줄 글'·'여러 줄 글'을 '텍스트'(text) 하나로. 옛 'textarea' 항목을 'text'로 바꾼다.
-- 이미 올린 문서(approval_doc.payload)는 그때 정의 그대로 둔다(화면이 옛 종류도 그대로 보여 준다).
UPDATE "approval_form"
SET "fields" = (
  SELECT jsonb_agg(
    CASE WHEN f->>'type' = 'textarea' THEN jsonb_set(f, '{type}', '"text"') ELSE f END
    ORDER BY ord
  )
  FROM jsonb_array_elements("fields") WITH ORDINALITY AS t(f, ord)
)
WHERE jsonb_typeof("fields") = 'array' AND "fields"::text LIKE '%"textarea"%';
