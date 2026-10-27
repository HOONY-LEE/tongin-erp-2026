-- 이미 들어가 있는 시연용 직원에게 직책을 한 번 채운다(직책이 비어 있는 경우만).
-- 실고객 운영 DB에는 이 사번들이 없어 아무것도 바뀌지 않는다. 새 DB는 데모 시드가 직책을 넣는다.
UPDATE "employee" SET "position_id" = (SELECT "id" FROM "position" WHERE "name" = '지점장')
WHERE "position_id" IS NULL
  AND ("emp_no" IN ('E1001', 'E1004', 'E1006', 'E1008', 'E1010') OR "emp_no" ~ '^E2[0-9]{2}1$');

UPDATE "employee" SET "position_id" = (SELECT "id" FROM "position" WHERE "name" = '과장')
WHERE "position_id" IS NULL AND "emp_no" IN ('E1002', 'E1007');

UPDATE "employee" SET "position_id" = (SELECT "id" FROM "position" WHERE "name" = '현장팀장')
WHERE "position_id" IS NULL
  AND ("emp_no" IN ('E1003', 'E1005', 'E1009') OR "emp_no" ~ '^E2[0-9]{2}3$');
