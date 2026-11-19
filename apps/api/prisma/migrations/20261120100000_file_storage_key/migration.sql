-- 파일 내용을 S3로 옮길 수 있게: bytes는 비울 수 있고, storage_key(S3 키)를 둔다
ALTER TABLE "work_photo" ALTER COLUMN "bytes" DROP NOT NULL, ADD COLUMN "storage_key" TEXT;
ALTER TABLE "ai_file" ALTER COLUMN "bytes" DROP NOT NULL, ADD COLUMN "storage_key" TEXT;
ALTER TABLE "agent_reference_file" ALTER COLUMN "bytes" DROP NOT NULL, ADD COLUMN "storage_key" TEXT;
ALTER TABLE "approval_attachment" ALTER COLUMN "bytes" DROP NOT NULL, ADD COLUMN "storage_key" TEXT;
ALTER TABLE "drive_content" ALTER COLUMN "bytes" DROP NOT NULL, ADD COLUMN "storage_key" TEXT;
