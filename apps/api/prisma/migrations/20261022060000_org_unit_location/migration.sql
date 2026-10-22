-- 조직(지점) 위치 — 대시보드 지도에 지점을 점으로 찍는다(2026-10-22)
-- AlterTable
ALTER TABLE "org_unit" ADD COLUMN     "addr" TEXT,
ADD COLUMN     "addr_detail" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "sido" TEXT,
ADD COLUMN     "sigungu" TEXT,
ADD COLUMN     "zipcode" TEXT;


-- 데모 지점은 구(區) 중심 좌표로 대략 채운다 — 실제 주소는 조직관리에서 주소 검색으로 고친다
UPDATE "org_unit" SET "sido" = '서울', "sigungu" = '강남구', "addr" = '서울 강남구', "lat" = 37.5172, "lng" = 127.0473 WHERE "code" = 'BR-GN' AND "lat" IS NULL;
UPDATE "org_unit" SET "sido" = '서울', "sigungu" = '송파구', "addr" = '서울 송파구', "lat" = 37.5145, "lng" = 127.1059 WHERE "code" = 'BR-SP' AND "lat" IS NULL;
UPDATE "org_unit" SET "sido" = '경기', "sigungu" = '성남시 분당구', "addr" = '경기 성남시 분당구', "lat" = 37.3827, "lng" = 127.1189 WHERE "code" = 'BR-BD' AND "lat" IS NULL;
UPDATE "org_unit" SET "sido" = '경기', "sigungu" = '고양시 일산동구', "addr" = '경기 고양시 일산동구', "lat" = 37.6584, "lng" = 126.7748 WHERE "code" = 'BR-IS' AND "lat" IS NULL;
UPDATE "org_unit" SET "sido" = '부산', "sigungu" = '해운대구', "addr" = '부산 해운대구', "lat" = 35.1631, "lng" = 129.1636 WHERE "code" = 'BR-BS' AND "lat" IS NULL;
