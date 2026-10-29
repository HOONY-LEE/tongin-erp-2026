-- '홍보디자인팀'은 실제 조직이 아니다 — 디자인·마케팅은 따로 있는 부서. 메뉴 구성을 둘로 나눈다(배치는 그대로 복사).
-- 구성이 있는 DB에만(새 DB는 시드가 넣는다). 관리자가 고친 배치는 두 구성 모두에 남는다.

-- 1) 마케팅팀 — 홍보디자인팀 배치를 복사해 새로 만든다
INSERT INTO "menu_profile" ("id", "name", "description", "layout", "priority", "is_default", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), '마케팅팀', '마케팅 캠페인·홍보 — 캠페인과 팀 업무 중심',
       replace(p."layout"::text, '"디자인·홍보"', '"마케팅·홍보"')::jsonb, p."priority", false, p."is_active", now(), now()
FROM "menu_profile" p
WHERE p."name" = '홍보디자인팀'
  AND NOT EXISTS (SELECT 1 FROM "menu_profile" WHERE "name" = '마케팅팀');

-- 2) 마케팅 부서 대상을 마케팅팀으로 옮긴다
UPDATE "menu_profile_target" t
SET "profile_id" = (SELECT "id" FROM "menu_profile" WHERE "name" = '마케팅팀' LIMIT 1)
FROM "menu_profile" p, "org_unit" o
WHERE t."profile_id" = p."id" AND p."name" = '홍보디자인팀'
  AND t."kind" = 'ORG' AND t."target_id" = o."id" AND o."name" = '마케팅'
  AND EXISTS (SELECT 1 FROM "menu_profile" WHERE "name" = '마케팅팀');

-- 3) 홍보디자인팀 → 디자인팀
UPDATE "menu_profile"
SET "name" = '디자인팀', "description" = '디자인·홍보물 요청 처리 — 팀 업무 중심', "updated_at" = now()
WHERE "name" = '홍보디자인팀'
  AND NOT EXISTS (SELECT 1 FROM "menu_profile" WHERE "name" = '디자인팀');
