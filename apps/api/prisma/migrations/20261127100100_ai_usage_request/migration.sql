-- AI 사용 기록에 요청 내용(사람이 물은 글·에이전트 요청)을 남긴다 — AI 관리 > 사용 기록에서 본다
ALTER TABLE "ai_usage_log" ADD COLUMN "request" TEXT;
