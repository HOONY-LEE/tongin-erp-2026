-- 에이전트 AI 대화 기록(대화로 만들기 → 편집 화면 AI 대화로 이어짐)
ALTER TABLE "agent_blueprint" ADD COLUMN "chat" JSONB NOT NULL DEFAULT '[]';
