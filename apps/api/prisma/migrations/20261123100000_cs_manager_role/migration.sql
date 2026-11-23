-- '상담 관리자' 권한 그룹 — 상담 콘솔의 '전체 전화'(모든 상담·문자 보기, 상담 메모 프리셋 관리)를
-- 본사 직원 모두가 아니라 이 그룹에 든 사람만 갖게 한다.
-- 계정을 이 그룹에 넣는 일은 계정·권한 화면(또는 운영 작업)에서 한다 — 마이그레이션은 사람을 고르지 않는다.

INSERT INTO "permission" ("id", "code", "name")
VALUES (gen_random_uuid(), 'CS_CALL.ALL', 'CS_CALL.ALL')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role" ("id", "code", "name", "description", "is_system", "field_app", "sort_order")
VALUES (gen_random_uuid(), 'CS_MANAGER', '상담 관리자',
        '상담 콘솔 전체 보기 — 모든 상담원의 상담·문자 내역, 상담 메모 프리셋 관리', false, false, 60)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r, "permission" p
WHERE r."code" = 'CS_MANAGER' AND p."code" = 'CS_CALL.ALL'
ON CONFLICT DO NOTHING;

-- 본사 직원 그룹에서는 뺀다
DELETE FROM "role_permission" rp
USING "role" r, "permission" p
WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
  AND r."code" = 'HQ_STAFF' AND p."code" = 'CS_CALL.ALL';
