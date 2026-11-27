-- 고객 문자 수신거부
ALTER TABLE "customer" ADD COLUMN "sms_opt_out" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customer" ADD COLUMN "sms_opt_out_at" TIMESTAMPTZ(6);
