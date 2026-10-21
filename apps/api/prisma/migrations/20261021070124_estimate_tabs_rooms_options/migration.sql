-- 견적 상세 4단계 화면: 방 틀 키, 영문 품목명, 구조화된 옵션(코드·종류·요청일).
-- 모두 nullable 컬럼 추가뿐 — 기존 데이터는 그대로다.
ALTER TABLE "estimate_zone" ADD COLUMN "room_key" TEXT;
ALTER TABLE "estimate_line" ADD COLUMN "item_name_eng" TEXT;
ALTER TABLE "estimate_addon"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "variant" TEXT,
  ADD COLUMN "service_date" DATE;
