-- 대표님 메뉴 구성 — 홈 / 관리 / 기타 세 묶음으로(2026-11-27 요청)
--  홈: 대시보드·공지사항·작업관리·캘린더·결재함·AI 에이전트·입금확인
--  관리: 조직관리·지점관리·지점 관리 기록·계정·권한·인사·성과·성과 평가
--  기타: 드라이브·Agent Builder·정산·미수금·업무분장·대시보드 관리
-- 구성이 없으면(새 DB) 아무것도 바꾸지 않는다 — 그때는 시드(seed-demo-menus.ts)가 같은 구성으로 만든다
UPDATE "menu_profile"
SET "layout" = '{"groups":[{"label":"홈","items":["dashboard","notices","tasks","calendar","approvals","ai","payments-confirm"]},{"label":"관리","items":["org-mgmt","branches","branch-cases","accounts","hr","performance"]},{"label":"기타","items":["drive","agent-builder","settlements","duties","dashboard-admin"]}]}'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = '대표님';
