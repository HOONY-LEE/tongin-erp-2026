-- 메뉴 구성의 '정산' 묶음을 처음부터 펼쳐 둔다(기본 구성에서 접혀 있던 것)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(CASE WHEN g->>'label' = '정산' THEN g - 'collapsed' ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(p."layout"->'groups') g
  WHERE g->>'label' = '정산' AND (g->>'collapsed')::boolean IS TRUE
);
