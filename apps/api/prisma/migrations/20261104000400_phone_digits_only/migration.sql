-- 연락처는 숫자만 저장한다(보일 때 화면이 하이픈을 넣는다) — 이미 들어간 값의 하이픈·공백을 뺀다
UPDATE "customer" SET "phone_primary" = NULLIF(regexp_replace("phone_primary", '[^0-9]', '', 'g'), '') WHERE "phone_primary" ~ '[^0-9]';
UPDATE "employee" SET "phone" = NULLIF(regexp_replace("phone", '[^0-9]', '', 'g'), '') WHERE "phone" ~ '[^0-9]';
UPDATE "employee" SET "emergency_phone" = NULLIF(regexp_replace("emergency_phone", '[^0-9]', '', 'g'), '') WHERE "emergency_phone" ~ '[^0-9]';
UPDATE "partner" SET "phone" = NULLIF(regexp_replace("phone", '[^0-9]', '', 'g'), '') WHERE "phone" ~ '[^0-9]';
UPDATE "campaign_recipient" SET "phone" = regexp_replace("phone", '[^0-9]', '', 'g') WHERE "phone" ~ '[^0-9]';
UPDATE "space_reservation" SET "customer_phone" = NULLIF(regexp_replace("customer_phone", '[^0-9]', '', 'g'), '') WHERE "customer_phone" ~ '[^0-9]';
