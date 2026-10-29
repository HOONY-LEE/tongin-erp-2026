-- 경영관리팀 업무 그룹(인사 담당)이 결재 양식·결재선을 정한다 — 그룹이 이미 있는 DB에만(새 DB는 시드가 넣는다)
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "role" r, "permission" p
WHERE r."code" = 'TEAM_MGMT' AND p."code" = 'APPROVAL.MANAGE'
ON CONFLICT DO NOTHING;
