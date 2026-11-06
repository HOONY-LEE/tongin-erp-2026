-- 고객관리부 상담 콘솔 — 상담 콜(자동 배분·아웃콜) · 상담원 상태
CREATE TABLE "cs_call" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OUTCALL',
    "agent_emp_id" UUID,
    "customer_id" UUID,
    "lead_id" UUID,
    "channel" TEXT,
    "memo" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMPTZ(6),
    "done_at" TIMESTAMPTZ(6),
    CONSTRAINT "cs_call_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_call_status_received_at_idx" ON "cs_call"("status", "received_at");
CREATE INDEX "cs_call_agent_emp_id_status_idx" ON "cs_call"("agent_emp_id", "status");

CREATE TABLE "cs_agent" (
    "employee_id" UUID NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "last_free_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cs_agent_pkey" PRIMARY KEY ("employee_id")
);

-- 메뉴: 고객관리팀 구성의 '고객 응대' 맨 앞, 기본(전체 메뉴) 구성의 접수 뒤에 '상담 콘솔'(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'leads' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"callcenter"'::jsonb, i * 2 - 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'leads'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."name" IN ('고객관리팀', '기본(전체 메뉴)')
  AND p."layout"::text LIKE '%"leads"%' AND p."layout"::text NOT LIKE '%"callcenter"%';
