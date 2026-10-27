-- 권한 그룹(역할) 확장 + 직책 + 권한을 READ/WRITE → CRUD로 나누기

-- 1) 권한 그룹 속성
ALTER TABLE "role" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "role" ADD COLUMN "field_app" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "role" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "role" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "role" SET "is_system" = true WHERE "code" IN ('SUPER_ADMIN', 'FRANCHISE', 'FIELD', 'OUTSOURCE');
UPDATE "role" SET "field_app" = true WHERE "code" IN ('FIELD', 'OUTSOURCE');
UPDATE "role" SET "sort_order" = CASE "code"
  WHEN 'SUPER_ADMIN' THEN 0 WHEN 'FRANCHISE' THEN 10 WHEN 'FIELD' THEN 20 WHEN 'OUTSOURCE' THEN 30 ELSE 100 END;

-- 2) 직책
CREATE TABLE "position" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_role_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "position_name_key" ON "position"("name");
ALTER TABLE "position" ADD CONSTRAINT "position_default_role_id_fkey" FOREIGN KEY ("default_role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee" ADD COLUMN "position_id" UUID;
ALTER TABLE "employee" ADD CONSTRAINT "employee_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) X.WRITE → X.CREATE / X.UPDATE / X.DELETE (기존 그룹이 가진 권한은 그대로 유지)
INSERT INTO "permission" ("id", "code", "name")
SELECT gen_random_uuid(), split_part(p."code", '.', 1) || '.' || a.act, split_part(p."code", '.', 1) || '.' || a.act
FROM "permission" p
CROSS JOIN (VALUES ('CREATE'), ('UPDATE'), ('DELETE')) AS a(act)
WHERE p."code" LIKE '%.WRITE'
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT rp."role_id", np."id"
FROM "role_permission" rp
JOIN "permission" p ON p."id" = rp."permission_id" AND p."code" LIKE '%.WRITE'
CROSS JOIN (VALUES ('CREATE'), ('UPDATE'), ('DELETE')) AS a(act)
JOIN "permission" np ON np."code" = split_part(p."code", '.', 1) || '.' || a.act
ON CONFLICT DO NOTHING;

-- 현장 작업팀은 작업을 시작·완료(수정)만 한다 — 등록·삭제는 주지 않는다
DELETE FROM "role_permission" rp
USING "role" r, "permission" p
WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
  AND r."code" = 'FIELD' AND p."code" IN ('WORK_ORDER.CREATE', 'WORK_ORDER.DELETE');

DELETE FROM "permission" WHERE "code" LIKE '%.WRITE';
