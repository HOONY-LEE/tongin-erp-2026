-- 견적 작업조건: 엘리베이터 여부(불리언) → 작업방식(선택안함/사다리차/엘리베이터/계단/기타) + 기타 메모
-- 기존 값을 먼저 옮긴 뒤 옛 컬럼을 지운다.

ALTER TABLE "estimate"
  ADD COLUMN "from_access" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "from_access_note" TEXT,
  ADD COLUMN "to_access" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "to_access_note" TEXT;

-- true는 엘리베이터로 확정. false는 "엘리베이터는 아니다"만 알 뿐 실제 방법(사다리차/계단)은
-- 모르므로 추측하지 않고 선택안함(NONE, 기본값)으로 둔다.
UPDATE "estimate" SET "from_access" = 'ELEVATOR' WHERE "from_elevator" = true;
UPDATE "estimate" SET "to_access" = 'ELEVATOR' WHERE "to_elevator" = true;

ALTER TABLE "estimate"
  DROP COLUMN "from_elevator",
  DROP COLUMN "to_elevator";
