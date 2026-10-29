-- @updatedAt은 DB 기본값 없이 Prisma가 채운다(위 마이그레이션의 시드 행 때문에 잠깐 둔 기본값을 뺀다)
ALTER TABLE "approval_form" ALTER COLUMN "updated_at" DROP DEFAULT;
