-- 전화번호는 숫자만 저장(화면에서 하이픈을 붙인다) — 예전에 하이픈째로 들어간 값을 숫자만 남긴다.
-- 숫자가 하나도 없으면: 비워도 되는 칸은 NULL, 꼭 있어야 하는 칸은 그대로 둔다.
UPDATE "employee" SET "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '') WHERE "phone" ~ '\D';
UPDATE "employee" SET "emergency_phone" = NULLIF(regexp_replace("emergency_phone", '\D', '', 'g'), '') WHERE "emergency_phone" ~ '\D';
UPDATE "customer" SET "phone_primary" = NULLIF(regexp_replace("phone_primary", '\D', '', 'g'), '') WHERE "phone_primary" ~ '\D';
UPDATE "partner" SET "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '') WHERE "phone" ~ '\D';
UPDATE "space_reservation" SET "customer_phone" = NULLIF(regexp_replace("customer_phone", '\D', '', 'g'), '') WHERE "customer_phone" ~ '\D';
UPDATE "franchise_info" SET "owner_phone" = NULLIF(regexp_replace("owner_phone", '\D', '', 'g'), '') WHERE "owner_phone" ~ '\D';
UPDATE "crm_lead" SET "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '') WHERE "phone" ~ '\D';
UPDATE "campaign_recipient" SET "phone" = regexp_replace("phone", '\D', '', 'g') WHERE "phone" ~ '\D' AND "phone" ~ '\d';
UPDATE "cs_call" SET "phone" = regexp_replace("phone", '\D', '', 'g') WHERE "phone" ~ '\D' AND "phone" ~ '\d';
UPDATE "cs_sms" SET "phone" = regexp_replace("phone", '\D', '', 'g') WHERE "phone" ~ '\D' AND "phone" ~ '\d';
UPDATE "cs_transfer_target" SET "number" = regexp_replace("number", '\D', '', 'g') WHERE "number" ~ '\D' AND "number" ~ '\d';
