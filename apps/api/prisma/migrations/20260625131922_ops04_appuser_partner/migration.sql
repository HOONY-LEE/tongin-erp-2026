-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "partner_id" UUID;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
