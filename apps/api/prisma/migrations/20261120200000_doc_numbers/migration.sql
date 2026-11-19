-- 문서 번호 통일: 접두어 2자 + YYMMDD + 날짜별 일련 4자리(고객은 CU + 일련 6자리)
--   콜 CL · 접수 RC · 견적 ES · 계약 CT · 작업 WO · 청구 IV · 자재 MO · 부가서비스 SV · A/S·CS 접수 AS/CS · 고객 CU
-- 옛 번호는 legacy_no에 남겨 옛 번호로도 찾을 수 있게 한다.

ALTER TABLE "cs_call" ADD COLUMN "call_no" TEXT;
ALTER TABLE "customer" ADD COLUMN "customer_no" TEXT, ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "lead" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "estimate" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "contract" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "work_order" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "invoice" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "material_order" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "service_order" ADD COLUMN "legacy_no" TEXT;
ALTER TABLE "support_ticket" ADD COLUMN "legacy_no" TEXT;

CREATE TABLE "doc_sequence" (
    "key" TEXT NOT NULL,
    "last" INTEGER NOT NULL,
    CONSTRAINT "doc_sequence_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "cs_call_call_no_key" ON "cs_call"("call_no");
CREATE UNIQUE INDEX "customer_customer_no_key" ON "customer"("customer_no");

-- 번호 하나 받기 — 키별 카운터를 한 문장으로 올리므로 동시에 불려도 겹치지 않는다
CREATE OR REPLACE FUNCTION next_doc_no(p TEXT, d DATE DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  k TEXT;
  n INT;
BEGIN
  k := CASE WHEN p = 'CU' THEN 'CU' ELSE p || to_char(d, 'YYMMDD') END;
  INSERT INTO doc_sequence(key, last) VALUES (k, 1)
  ON CONFLICT (key) DO UPDATE SET last = doc_sequence.last + 1
  RETURNING last INTO n;
  IF p = 'CU' THEN
    RETURN k || CASE WHEN n < 1000000 THEN lpad(n::text, 6, '0') ELSE n::text END;
  END IF;
  RETURN k || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END;
END $$;

-- 콜·고객은 만드는 곳이 여러 군데라 DB가 번호를 붙인다
CREATE OR REPLACE FUNCTION cs_call_set_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.call_no IS NULL THEN
    NEW.call_no := next_doc_no('CL', (COALESCE(NEW.received_at, now()) AT TIME ZONE 'Asia/Seoul')::date);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cs_call_set_no BEFORE INSERT ON "cs_call" FOR EACH ROW EXECUTE FUNCTION cs_call_set_no();

CREATE OR REPLACE FUNCTION customer_set_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_no IS NULL THEN
    NEW.customer_no := next_doc_no('CU');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_set_no BEFORE INSERT ON "customer" FOR EACH ROW EXECUTE FUNCTION customer_set_no();

-- 지금 있는 행 — 만든 순서대로 새 번호, 옛 번호는 legacy_no로
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, received_at FROM cs_call ORDER BY received_at, id LOOP
    UPDATE cs_call SET call_no = next_doc_no('CL', (r.received_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM customer ORDER BY created_at, id LOOP
    UPDATE customer SET customer_no = next_doc_no('CU') WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM lead ORDER BY created_at, id LOOP
    UPDATE lead SET legacy_no = lead_no, lead_no = next_doc_no('RC', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM estimate ORDER BY created_at, id LOOP
    UPDATE estimate SET legacy_no = estimate_no, estimate_no = next_doc_no('ES', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM contract ORDER BY created_at, id LOOP
    UPDATE contract SET legacy_no = contract_no, contract_no = next_doc_no('CT', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM work_order ORDER BY created_at, id LOOP
    UPDATE work_order SET legacy_no = work_no, work_no = next_doc_no('WO', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM invoice ORDER BY created_at, id LOOP
    UPDATE invoice SET legacy_no = invoice_no, invoice_no = next_doc_no('IV', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM material_order ORDER BY created_at, id LOOP
    UPDATE material_order SET legacy_no = order_no, order_no = next_doc_no('MO', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at FROM service_order ORDER BY created_at, id LOOP
    UPDATE service_order SET legacy_no = order_no, order_no = next_doc_no('SV', (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, created_at, kind FROM support_ticket ORDER BY created_at, id LOOP
    UPDATE support_ticket SET legacy_no = ticket_no, ticket_no = next_doc_no(r.kind, (r.created_at AT TIME ZONE 'Asia/Seoul')::date) WHERE id = r.id;
  END LOOP;
END $$;

-- 옛 번호로 찾기
CREATE INDEX "lead_legacy_no_idx" ON "lead"("legacy_no");
CREATE INDEX "customer_legacy_no_idx" ON "customer"("legacy_no");
