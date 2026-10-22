-- AI 대화 제목 — 사용자가 직접 바꾼 제목인지 표시(자동 요약 제목으로 덮어쓰지 않게)
ALTER TABLE "ai_conversation" ADD COLUMN "title_manual" BOOLEAN NOT NULL DEFAULT false;
