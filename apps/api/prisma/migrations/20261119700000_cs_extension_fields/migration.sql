-- 내선 관리: 돌려주기 연락처에 부서·내선번호·메모
ALTER TABLE "cs_transfer_target" ADD COLUMN "dept" TEXT;
ALTER TABLE "cs_transfer_target" ADD COLUMN "ext_no" TEXT;
ALTER TABLE "cs_transfer_target" ADD COLUMN "memo" TEXT;

-- 메뉴: '문자 발송 내역' 바로 뒤에 '내선 관리'(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'smsHistory' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"extensions"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'smsHistory'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"smsHistory"%' AND p."layout"::text NOT LIKE '%"extensions"%';
