-- 캠페인 기간(할인·이벤트 적용 기간) — 비워 두면 기간 없음
ALTER TABLE "campaign" ADD COLUMN "period_start" DATE;
ALTER TABLE "campaign" ADD COLUMN "period_end" DATE;
