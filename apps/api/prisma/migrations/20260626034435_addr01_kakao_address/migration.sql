-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "addr" TEXT,
ADD COLUMN     "addr_detail" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "sido" TEXT,
ADD COLUMN     "sigungu" TEXT,
ADD COLUMN     "zipcode" TEXT;

-- AlterTable
ALTER TABLE "estimate" ADD COLUMN     "from_addr_detail" TEXT,
ADD COLUMN     "from_lat" DOUBLE PRECISION,
ADD COLUMN     "from_lng" DOUBLE PRECISION,
ADD COLUMN     "from_sido" TEXT,
ADD COLUMN     "from_sigungu" TEXT,
ADD COLUMN     "from_zipcode" TEXT,
ADD COLUMN     "to_addr_detail" TEXT,
ADD COLUMN     "to_lat" DOUBLE PRECISION,
ADD COLUMN     "to_lng" DOUBLE PRECISION,
ADD COLUMN     "to_sido" TEXT,
ADD COLUMN     "to_sigungu" TEXT,
ADD COLUMN     "to_zipcode" TEXT;

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "from_addr_detail" TEXT,
ADD COLUMN     "from_lat" DOUBLE PRECISION,
ADD COLUMN     "from_lng" DOUBLE PRECISION,
ADD COLUMN     "from_sido" TEXT,
ADD COLUMN     "from_sigungu" TEXT,
ADD COLUMN     "to_addr_detail" TEXT,
ADD COLUMN     "to_lat" DOUBLE PRECISION,
ADD COLUMN     "to_lng" DOUBLE PRECISION,
ADD COLUMN     "to_sido" TEXT,
ADD COLUMN     "to_sigungu" TEXT;
