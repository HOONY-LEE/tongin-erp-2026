-- 통화 받아쓰기(한국AI통신 transcript.completed) — 구간 [{speaker,start,end,text}]
ALTER TABLE "cs_call" ADD COLUMN "transcript" JSONB;
ALTER TABLE "cs_call" ADD COLUMN "transcript_at" TIMESTAMPTZ(6);
