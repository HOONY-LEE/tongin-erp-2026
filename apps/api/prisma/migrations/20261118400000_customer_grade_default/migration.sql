-- 고객 등급 기본값은 '일반'(NORMAL) — 접수·상담 콘솔에서 자동으로 생기는 고객도 일반으로 시작한다(2026-11-18)
ALTER TABLE "customer" ALTER COLUMN "grade" SET DEFAULT 'NORMAL';
UPDATE "customer" SET "grade" = 'NORMAL' WHERE "grade" IS NULL;
