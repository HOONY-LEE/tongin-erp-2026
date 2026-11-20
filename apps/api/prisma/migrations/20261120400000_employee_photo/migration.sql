-- 직원 프로필 사진
ALTER TABLE "employee" ADD COLUMN "photo_bytes" BYTEA, ADD COLUMN "photo_key" TEXT, ADD COLUMN "photo_at" TIMESTAMPTZ(6);
