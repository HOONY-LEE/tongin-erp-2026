-- 조직도 30명 입사일(시연용으로 정한 날 — 직급이 높을수록 오래 근무, 대표이사 1996년부터).
-- 본사 조직(지점 아님)에 있는 같은 이름 직원만. 사번은 그대로 둔다(기존 전산 사번 유지). 입사 이력 날짜도 맞춘다.
CREATE TEMP TABLE _hire (name text, d date);
INSERT INTO _hire VALUES
  ('고국종', DATE '1996-03-04'),
  ('배기덕', DATE '1998-03-02'),
  ('김완성', DATE '1997-05-12'),
  ('강은숙', DATE '2008-08-18'),
  ('이상은', DATE '2019-07-01'),
  ('정철민', DATE '1999-02-01'),
  ('김준영', DATE '2005-09-01'),
  ('곽성수', DATE '2014-04-01'),
  ('최봉준', DATE '2020-03-02'),
  ('이경철', DATE '2004-06-14'),
  ('주미선', DATE '2003-04-07'),
  ('허윤무', DATE '2009-11-02'),
  ('최동희', DATE '2010-07-05'),
  ('안수지', DATE '2024-07-01'),
  ('권기영', DATE '2025-03-04'),
  ('김미영', DATE '2015-06-01'),
  ('노은주', DATE '2016-02-15'),
  ('김은혜', DATE '2019-11-11'),
  ('임기숙', DATE '2022-03-02'),
  ('이명원', DATE '2023-08-01'),
  ('김미선', DATE '2011-03-02'),
  ('전지숙', DATE '2006-03-02'),
  ('왕채은', DATE '2022-09-05'),
  ('정주연', DATE '2024-01-02'),
  ('송승호', DATE '2012-09-03'),
  ('김수빈', DATE '2023-03-06'),
  ('피규열', DATE '2013-01-07'),
  ('김태원', DATE '2016-10-04'),
  ('오태환', DATE '2017-05-08'),
  ('신민근', DATE '2001-10-08');

UPDATE "employee" e SET "hire_date" = h.d
FROM _hire h, "org_unit" o
WHERE e."name" = h.name AND o."id" = e."org_unit_id" AND o."type" <> 'BRANCH';

UPDATE "employee_history" eh SET "effective_date" = e."hire_date"
FROM "employee" e, _hire h, "org_unit" o
WHERE eh."employee_id" = e."id" AND eh."kind" = 'JOIN'
  AND e."name" = h.name AND o."id" = e."org_unit_id" AND o."type" <> 'BRANCH';

DROP TABLE _hire;
