-- 대시보드 차트 기본 색을 블랙으로 — 기본값으로 들어가 있던 통인색도 블랙으로
ALTER TABLE "dashboard" ALTER COLUMN "color" SET DEFAULT 'black';
UPDATE "dashboard" SET "color" = 'black' WHERE "color" = 'tongin';
