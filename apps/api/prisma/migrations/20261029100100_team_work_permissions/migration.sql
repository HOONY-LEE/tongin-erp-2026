-- 새 메뉴(공지사항·팀 업무·계약·자산·지점 관리 기록) 권한 코드 + 이미 있는 '본사 직원' 그룹에 기본 권한 한 번만 더하기
--
-- 권한 코드 자체는 서버 부팅 시더(PERMISSION_CATALOG 동기화)도 넣지만, 아래 부여가 그 행을 찾아야 해서 여기서 먼저 만든다
-- (이름은 시더가 부팅 때 '공지사항 · 조회'처럼 고쳐 쓴다).
-- '본사 직원'(HQ_STAFF) 그룹은 seed-demo.ts가 처음 만들 때만 권한을 넣으므로, 이미 있는 DB에는 새 메뉴 권한이 없다.
-- 마이그레이션은 DB마다 딱 한 번 돌기 때문에, 나중에 관리자가 이 권한을 빼도 다시 살아나지 않는다.
-- 그룹이 없는 새 DB에서는 아무것도 하지 않는다(seed-demo.ts가 만들 때 새 권한까지 넣는다).

INSERT INTO "permission" ("id", "code", "name")
SELECT gen_random_uuid(), r.k || '.' || a.act, r.k || '.' || a.act
FROM (VALUES ('NOTICE'), ('TASK'), ('ASSET'), ('BRANCH_CASE')) AS r(k)
CROSS JOIN (VALUES ('READ'), ('CREATE'), ('UPDATE'), ('DELETE')) AS a(act)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT ro."id", p."id"
FROM "role" ro
JOIN "permission" p ON p."code" IN ('NOTICE.READ', 'TASK.READ', 'TASK.CREATE', 'TASK.UPDATE')
WHERE ro."code" = 'HQ_STAFF'
ON CONFLICT DO NOTHING;
