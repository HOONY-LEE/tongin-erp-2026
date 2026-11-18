-- 상담 콘솔 마지막 확인 시각 — 받을 상담원이 없으면 번호를 안내 멘트(웹훅)로 돌리는 데 쓴다(2026-11-18)
ALTER TABLE "cs_agent" ADD COLUMN "seen_at" TIMESTAMPTZ(6);
