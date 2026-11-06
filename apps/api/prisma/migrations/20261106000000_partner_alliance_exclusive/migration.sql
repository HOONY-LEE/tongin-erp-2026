-- 제휴·전속 — 거래처에 계약 상태·내용·접수 방식·메모. 전속 계약사는 type = 'EXCLUSIVE'(외주 용역업체 OUTSOURCE와 따로)
ALTER TABLE "partner" ADD COLUMN "contract_status" TEXT;
ALTER TABLE "partner" ADD COLUMN "benefit" TEXT;
ALTER TABLE "partner" ADD COLUMN "intake" TEXT;
ALTER TABLE "partner" ADD COLUMN "memo" TEXT;

-- 이미 있는 메뉴 구성에 '제휴·전속'을 고객관리 뒤에 넣는다(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'customers' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"alliances"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'customers'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"customers"%' AND p."layout"::text NOT LIKE '%"alliances"%';
