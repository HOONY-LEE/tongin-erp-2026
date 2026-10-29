-- 부동산사업부 신민근 소장에게 기업영업팀 메뉴 구성도 건다(계정 지정) — 구성·계정이 있는 DB에만
INSERT INTO "menu_profile_target" ("id", "profile_id", "kind", "target_id")
SELECT gen_random_uuid(), p."id", 'USER', u."id"
FROM "menu_profile" p, "app_user" u
WHERE p."name" = '기업영업팀' AND u."login_id" = 'minkeun_shin'
ON CONFLICT DO NOTHING;
