-- 고객 등급을 정해진 목록(공통코드 CUSTOMER_GRADE)으로 관리한다(2026-10-22)
-- 기본: 일반(NORMAL) · 골드(GOLD) · VIP. 관리자는 고객관리 화면의 설정에서 추가·이름 변경·사용 안 함을 할 수 있다.
INSERT INTO "common_code" ("id", "code_group", "code", "name", "sort_order", "is_active") VALUES
  (gen_random_uuid(), 'CUSTOMER_GRADE', 'NORMAL', '일반', 10, true),
  (gen_random_uuid(), 'CUSTOMER_GRADE', 'GOLD', '골드', 20, true),
  (gen_random_uuid(), 'CUSTOMER_GRADE', 'VIP', 'VIP', 30, true)
ON CONFLICT ("code_group", "code") DO NOTHING;

-- 예전 자유 입력값을 목록에 맞춘다(목록에 없는 값은 일반으로)
UPDATE "customer" SET "grade" = 'VIP' WHERE upper(trim("grade")) = 'VIP';
UPDATE "customer" SET "grade" = 'GOLD' WHERE upper(trim("grade")) IN ('GOLD', '골드', '우수');
UPDATE "customer" SET "grade" = 'NORMAL'
WHERE "grade" IS NULL OR "grade" NOT IN (SELECT "code" FROM "common_code" WHERE "code_group" = 'CUSTOMER_GRADE');
