-- AI 비서 대화마다 쓰는 Claude 모델(비우면 서버 기본 모델)
ALTER TABLE "ai_conversation" ADD COLUMN "model" TEXT;
