-- 기본 직책 — 처음 한 번만 넣는다(관리자가 이름·순서를 고치거나 지울 수 있다)
INSERT INTO "position" ("id", "name", "sort_order", "default_role_id")
SELECT gen_random_uuid(), v.name, v.ord,
       CASE WHEN v.name = '지점장' THEN (SELECT "id" FROM "role" WHERE "code" = 'FRANCHISE') END
FROM (VALUES ('회장', 10), ('대표', 20), ('이사', 30), ('부장', 40), ('차장', 50),
             ('과장', 60), ('대리', 70), ('사원', 80), ('지점장', 90), ('현장팀장', 100))
  AS v(name, ord)
ON CONFLICT ("name") DO NOTHING;
