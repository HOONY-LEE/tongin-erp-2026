-- 이사일 마감 상태 — 마감(CLOSED) / 마감 예정(SOON)(2026-11-19)
ALTER TABLE "move_closure" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CLOSED';
