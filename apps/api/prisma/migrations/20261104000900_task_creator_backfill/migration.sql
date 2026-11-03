-- 만든 사람이 비어 있는 업무(예전 시드·가져온 데이터)는 요청자, 없으면 담당자의 계정을 생성자로 채운다
UPDATE "team_task" t
SET "created_by_user_id" = u."id"
FROM "app_user" u
WHERE t."created_by_user_id" IS NULL
  AND u."employee_id" = COALESCE(t."requester_emp_id", t."assignee_emp_id");
