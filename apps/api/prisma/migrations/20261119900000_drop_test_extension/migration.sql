-- 시험용으로 넣었던 돌려주기 연락처(부서·내선 없이 이름만 '이성훈') 지우기
DELETE FROM "cs_transfer_target" WHERE "label" = '이성훈' AND "dept" IS NULL AND "ext_no" IS NULL;
