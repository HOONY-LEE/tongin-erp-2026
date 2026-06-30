-- CreateTable
CREATE TABLE "product_addon" (
    "product_id" UUID NOT NULL,
    "addon_service_id" UUID NOT NULL,
    "price_override" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_addon_pkey" PRIMARY KEY ("product_id","addon_service_id")
);

-- AddForeignKey
ALTER TABLE "product_addon" ADD CONSTRAINT "product_addon_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_addon" ADD CONSTRAINT "product_addon_addon_service_id_fkey" FOREIGN KEY ("addon_service_id") REFERENCES "addon_service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
