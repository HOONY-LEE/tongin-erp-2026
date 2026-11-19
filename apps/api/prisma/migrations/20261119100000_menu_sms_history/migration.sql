-- 메뉴: '상담 콘솔' 바로 뒤에 '문자 발송 내역'(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'callcenter' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"smsHistory"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'callcenter'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"callcenter"%' AND p."layout"::text NOT LIKE '%"smsHistory"%';
