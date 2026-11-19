-- PC 전화·상담 가능은 고객관리부(DEPT-CS와 하위 조직) 상담원 전용 — 다른 부서가 켜 둔 상태를 끈다
UPDATE "cs_agent" a
SET "available" = false, "sip_uri" = NULL, "sip_until" = NULL
WHERE a."employee_id" NOT IN (
  SELECT e."id" FROM "employee" e
  JOIN "org_unit" o ON o."id" = e."org_unit_id"
  LEFT JOIN "org_unit" p ON p."id" = o."parent_id"
  WHERE o."code" = 'DEPT-CS' OR p."code" = 'DEPT-CS'
);
