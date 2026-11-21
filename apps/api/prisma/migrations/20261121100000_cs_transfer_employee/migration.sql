-- 내선을 직원 계정과 잇는다(이름·직책·부서는 직원 정보를 따름)
ALTER TABLE "cs_transfer_target" ADD COLUMN "employee_id" UUID;
CREATE UNIQUE INDEX "cs_transfer_target_employee_id_key" ON "cs_transfer_target"("employee_id");
ALTER TABLE "cs_transfer_target" ADD CONSTRAINT "cs_transfer_target_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 기존 내선: 이름 첫 낱말(예: '홍길동 과장' → 홍길동)과 이름이 같은 재직 직원이 딱 한 명이면 잇는다
WITH m AS (
  SELECT t.id AS tid, MIN(e.id::text)::uuid AS eid
  FROM "cs_transfer_target" t
  JOIN "employee" e ON e.name = split_part(trim(t.label), ' ', 1) AND e.is_active AND e.resign_date IS NULL
  GROUP BY t.id
  HAVING COUNT(*) = 1
), u AS (
  -- 같은 직원에 내선이 여럿 걸리면 첫 것만
  SELECT DISTINCT ON (eid) tid, eid FROM m ORDER BY eid, tid
)
UPDATE "cs_transfer_target" t SET employee_id = u.eid FROM u WHERE t.id = u.tid;
