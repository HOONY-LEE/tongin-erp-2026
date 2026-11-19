-- 접수 상태에서 '작업중'(IN_PROGRESS)을 뺀다 — 작업토스에서 작업팀 완료 시 바로 작업완료.
-- (작업오더의 진행 상태 IN_PROGRESS는 현장 앱용으로 그대로 둔다)
UPDATE "lead" SET "status" = 'WORK_TOSS' WHERE "status" = 'IN_PROGRESS';
