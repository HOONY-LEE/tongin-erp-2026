-- 공간 예약: 공간(회의실·대여 공간)과 예약
-- CreateTable
CREATE TABLE "space" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MEETING',
    "location" TEXT,
    "capacity" INTEGER,
    "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "hourly_fee" INTEGER,
    "open_hour" INTEGER NOT NULL DEFAULT 8,
    "close_hour" INTEGER NOT NULL DEFAULT 22,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_reservation" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "booked_by" UUID NOT NULL,
    "attendee_emp_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "headcount" INTEGER,
    "fee" INTEGER,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "space_reservation_space_id_start_at_idx" ON "space_reservation"("space_id", "start_at");

-- CreateIndex
CREATE INDEX "space_reservation_start_at_idx" ON "space_reservation"("start_at");

-- AddForeignKey
ALTER TABLE "space_reservation" ADD CONSTRAINT "space_reservation_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 처음 공간 — 경영관리팀이 운영하는 서초 시그니처 파티룸(외부 대여)과 본사 회의실. 이름·시간·요금은 화면(공간 관리)에서 고친다
INSERT INTO "space" ("id", "name", "kind", "location", "capacity", "facilities", "color", "hourly_fee", "open_hour", "close_hour", "description", "sort_order", "updated_at")
VALUES
  (gen_random_uuid(), '서초 시그니처 파티룸', 'RENTAL', '서초', 30, ARRAY['빔프로젝터', '음향', '주방'], '#f97316', NULL, 10, 23, '외부 고객 대여 — 대여료·입금 여부를 함께 관리', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '본사 회의실', 'MEETING', '본사', 10, ARRAY['모니터', '화이트보드'], '#3b82f6', NULL, 8, 20, NULL, 20, CURRENT_TIMESTAMP);

-- 경영관리팀 업무 그룹이 공간·모든 예약을 관리한다(그룹이 있는 DB에만 — 새 DB는 시드)
INSERT INTO "permission" ("id", "code", "name")
VALUES (gen_random_uuid(), 'SPACE.MANAGE', '공간 예약 · 공간 관리·모든 예약 수정')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r, "permission" p
WHERE r."code" = 'TEAM_MGMT' AND p."code" = 'SPACE.MANAGE'
ON CONFLICT DO NOTHING;

-- 이미 있는 메뉴 구성에 '공간 예약'을 결재함 바로 뒤에 넣는다(결재함이 든 묶음, 아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'approvals' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"spaces"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'approvals'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"approvals"%' AND p."layout"::text NOT LIKE '%"spaces"%';
