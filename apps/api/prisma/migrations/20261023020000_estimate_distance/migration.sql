-- 출발지 → 도착지 거리(거리 할증 근거)
ALTER TABLE "estimate" ADD COLUMN "distance_km" DECIMAL(8,1);
ALTER TABLE "estimate" ADD COLUMN "duration_min" INTEGER;
ALTER TABLE "estimate" ADD COLUMN "distance_source" TEXT;

-- 거리 할증 기준(공통코드, 이름 칸에 숫자) — 기본: 30km까지 무료, 넘는 1km마다 3,000원
INSERT INTO "common_code" ("id", "code_group", "code", "name", "sort_order", "is_active")
VALUES
  (gen_random_uuid(), 'DISTANCE_SURCHARGE', 'FREE_KM', '30', 10, true),
  (gen_random_uuid(), 'DISTANCE_SURCHARGE', 'PER_KM', '3000', 20, true)
ON CONFLICT ("code_group", "code") DO NOTHING;
