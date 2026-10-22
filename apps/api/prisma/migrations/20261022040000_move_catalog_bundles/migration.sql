-- 이사물량 카탈로그 · 상품 구성(묶음) (2026-10-22)
--  · 이사물품 사전(cbm_item): 서버 코드·영문명·기본 톤·순서, 기본 부피 없어도 됨, 이름 전역 유일
--    (물품은 하나 — 방은 자주 쓰는 물품을 모아 둔 틀일 뿐)
--  · 방 틀(room_template / room_template_item), 처리방법(handling_method) — 코드 상수에서 데이터로
--  · 견적: 톤 견적(volume_unit, total_ton, line.ton), 3단계 저장 여부(options_saved_at)
--  · 상품 구성(product = 가정이사 등 묶음) ↔ 상품(addon_service): 필수/기본선택/선택 + 순서,
--    '이사물량' 상품(kind=VOLUME) 추가, 구성 밖 추가 상품 표시(estimate_addon.is_extra)

-- ── 이사물품 사전 ──
DROP INDEX "cbm_item_category_name_key";
ALTER TABLE "cbm_item" ADD COLUMN "code" TEXT,
ADD COLUMN "name_eng" TEXT,
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ton" DECIMAL(8,2),
ALTER COLUMN "cbm" DROP NOT NULL;

CREATE TEMP TABLE _seed_item (name TEXT, name_eng TEXT, category TEXT, ord INT);

INSERT INTO _seed_item VALUES
  ('장롱', 'Wardrobe', '침실', 10),
  ('이불', 'Bedding', '침실', 20),
  ('의류', 'Clothes', '침실', 30),
  ('침대', 'Bed', '침실', 40),
  ('협탁', 'Side Table', '침실', 50),
  ('책장', 'Bookshelf', '침실', 60),
  ('책', 'Books', '침실', 70),
  ('장식장', 'Display Cabinet', '침실', 80),
  ('공기청정기', 'Air Purifier', '침실', 90),
  ('고가구', 'Antique Furniture', '침실', 100),
  ('화장대', 'Dresser', '침실', 110),
  ('서랍장', 'Drawers', '침실', 120),
  ('탁자/책상', 'Table, Desk', '침실', 130),
  ('의자', 'Chair', '침실', 140),
  ('홈시어터', 'Home Theater', '침실', 150),
  ('오디오', 'Audio', '침실', 160),
  ('컴퓨터', 'Computer', '침실', 170),
  ('피아노', 'Piano', '침실', 180),
  ('에어컨', 'Air Conditioner', '침실', 190),
  ('장난감', 'Toys', '침실', 200),
  ('BOX류', 'Boxes', '침실', 210),
  ('에어드레서', 'Air Dresser', '침실', 220),
  ('소파', 'Sofa', '거실', 230),
  ('탁자', 'Table', '거실', 240),
  ('책상', 'Desk', '거실', 250),
  ('도자기류', 'Chinaware', '거실', 260),
  ('장식품', 'Ornaments', '거실', 270),
  ('콘솔', 'Console', '거실', 280),
  ('거실장', 'TV Cabinet', '거실', 290),
  ('식탁/의자', 'Dining Table, Chair', '주방', 300),
  ('수납장', 'Storage Cabinet', '주방', 310),
  ('냉장고', 'Refrigerator', '주방', 320),
  ('정수기냉장고', 'Water Purifier Refrigerator', '주방', 330),
  ('냉동고', 'Freezer', '주방', 340),
  ('식기세척기', 'Dishwasher', '주방', 350),
  ('식기건조기', 'Dish Dryer', '주방', 360),
  ('김치냉장고', 'Kimchi Refrigerator', '주방', 370),
  ('가스레인지', 'Gas Range', '주방', 380),
  ('전자레인지', 'Microwave', '주방', 390),
  ('쌀통', 'Rice Bin', '주방', 400),
  ('식기류', 'Dishes', '주방', 410),
  ('정수기', 'Water Purifier', '주방', 420),
  ('화분', 'Flower Pots', '기타', 430),
  ('항아리', 'Jars', '기타', 440),
  ('운동기구', 'Exercise Equipment', '기타', 450),
  ('자전거', 'Bicycle', '기타', 460),
  ('세탁기/건조기', 'Washer, Dryer', '기타', 470),
  ('신발류', 'Shoes', '기타', 480);

CREATE TEMP TABLE _seed_room (code TEXT, name TEXT, name_eng TEXT, ord INT);

INSERT INTO _seed_room VALUES
  ('MASTER', '안방', 'MASTER''S ROOM', 10),
  ('BED1', '건너방', 'BEDROOM', 20),
  ('BED2', '건너방2', 'BEDROOM 2', 30),
  ('BED3', '건너방3', 'BEDROOM 3', 40),
  ('BED4', '건너방4', 'BEDROOM 4', 50),
  ('LIVING', '거실', 'LIVING ROOM', 60),
  ('KITCHEN', '주방', 'KITCHEN', 70),
  ('BALCONY_FRONT', '앞 발코니', 'FRONT BALCONY', 80),
  ('BALCONY_BACK', '뒤 발코니', 'BACK BALCONY', 90),
  ('ETC', '다용도실·현관·화장실·창고', 'ETC', 100);

CREATE TEMP TABLE _seed_room_item (room_code TEXT, item_name TEXT, ord INT);

INSERT INTO _seed_room_item VALUES
  ('MASTER', '장롱', 10),
  ('MASTER', '이불', 20),
  ('MASTER', '의류', 30),
  ('MASTER', '침대', 40),
  ('MASTER', '협탁', 50),
  ('MASTER', '책장', 60),
  ('MASTER', '책', 70),
  ('MASTER', '장식장', 80),
  ('MASTER', '공기청정기', 90),
  ('MASTER', '고가구', 100),
  ('MASTER', '화장대', 110),
  ('MASTER', '서랍장', 120),
  ('MASTER', '탁자/책상', 130),
  ('MASTER', '의자', 140),
  ('MASTER', '홈시어터', 150),
  ('MASTER', '오디오', 160),
  ('MASTER', '컴퓨터', 170),
  ('MASTER', '피아노', 180),
  ('MASTER', '에어컨', 190),
  ('MASTER', '장난감', 200),
  ('MASTER', 'BOX류', 210),
  ('MASTER', '에어드레서', 220),
  ('BED1', '장롱', 10),
  ('BED1', '이불', 20),
  ('BED1', '의류', 30),
  ('BED1', '침대', 40),
  ('BED1', '협탁', 50),
  ('BED1', '책장', 60),
  ('BED1', '책', 70),
  ('BED1', '장식장', 80),
  ('BED1', '공기청정기', 90),
  ('BED1', '고가구', 100),
  ('BED1', '화장대', 110),
  ('BED1', '서랍장', 120),
  ('BED1', '탁자/책상', 130),
  ('BED1', '의자', 140),
  ('BED1', '홈시어터', 150),
  ('BED1', '오디오', 160),
  ('BED1', '컴퓨터', 170),
  ('BED1', '피아노', 180),
  ('BED1', '에어컨', 190),
  ('BED1', '장난감', 200),
  ('BED1', 'BOX류', 210),
  ('BED1', '에어드레서', 220),
  ('BED2', '장롱', 10),
  ('BED2', '이불', 20),
  ('BED2', '의류', 30),
  ('BED2', '침대', 40),
  ('BED2', '협탁', 50),
  ('BED2', '책장', 60),
  ('BED2', '책', 70),
  ('BED2', '장식장', 80),
  ('BED2', '공기청정기', 90),
  ('BED2', '고가구', 100),
  ('BED2', '화장대', 110),
  ('BED2', '서랍장', 120),
  ('BED2', '탁자/책상', 130),
  ('BED2', '의자', 140),
  ('BED2', '홈시어터', 150),
  ('BED2', '오디오', 160),
  ('BED2', '컴퓨터', 170),
  ('BED2', '피아노', 180),
  ('BED2', '에어컨', 190),
  ('BED2', '장난감', 200),
  ('BED2', 'BOX류', 210),
  ('BED2', '에어드레서', 220),
  ('BED3', '장롱', 10),
  ('BED3', '이불', 20),
  ('BED3', '의류', 30),
  ('BED3', '침대', 40),
  ('BED3', '협탁', 50),
  ('BED3', '책장', 60),
  ('BED3', '책', 70),
  ('BED3', '장식장', 80),
  ('BED3', '공기청정기', 90),
  ('BED3', '고가구', 100),
  ('BED3', '화장대', 110),
  ('BED3', '서랍장', 120),
  ('BED3', '탁자/책상', 130),
  ('BED3', '의자', 140),
  ('BED3', '홈시어터', 150),
  ('BED3', '오디오', 160),
  ('BED3', '컴퓨터', 170),
  ('BED3', '피아노', 180),
  ('BED3', '에어컨', 190),
  ('BED3', '장난감', 200),
  ('BED3', 'BOX류', 210),
  ('BED3', '에어드레서', 220),
  ('BED4', '장롱', 10),
  ('BED4', '이불', 20),
  ('BED4', '의류', 30),
  ('BED4', '침대', 40),
  ('BED4', '협탁', 50),
  ('BED4', '책장', 60),
  ('BED4', '책', 70),
  ('BED4', '장식장', 80),
  ('BED4', '공기청정기', 90),
  ('BED4', '고가구', 100),
  ('BED4', '화장대', 110),
  ('BED4', '서랍장', 120),
  ('BED4', '탁자/책상', 130),
  ('BED4', '의자', 140),
  ('BED4', '홈시어터', 150),
  ('BED4', '오디오', 160),
  ('BED4', '컴퓨터', 170),
  ('BED4', '피아노', 180),
  ('BED4', '에어컨', 190),
  ('BED4', '장난감', 200),
  ('BED4', 'BOX류', 210),
  ('BED4', '에어드레서', 220),
  ('LIVING', '소파', 10),
  ('LIVING', '탁자', 20),
  ('LIVING', '책', 30),
  ('LIVING', '책상', 40),
  ('LIVING', '고가구', 50),
  ('LIVING', '도자기류', 60),
  ('LIVING', '홈시어터', 70),
  ('LIVING', '오디오', 80),
  ('LIVING', '장식장', 90),
  ('LIVING', '장식품', 100),
  ('LIVING', '에어컨', 110),
  ('LIVING', '콘솔', 120),
  ('LIVING', '거실장', 130),
  ('LIVING', '에어드레서', 140),
  ('LIVING', '공기청정기', 150),
  ('KITCHEN', '식탁/의자', 10),
  ('KITCHEN', '장식장', 20),
  ('KITCHEN', '수납장', 30),
  ('KITCHEN', '냉장고', 40),
  ('KITCHEN', '정수기냉장고', 50),
  ('KITCHEN', '냉동고', 60),
  ('KITCHEN', '식기세척기', 70),
  ('KITCHEN', '식기건조기', 80),
  ('KITCHEN', '김치냉장고', 90),
  ('KITCHEN', '가스레인지', 100),
  ('KITCHEN', '전자레인지', 110),
  ('KITCHEN', '쌀통', 120),
  ('KITCHEN', '식기류', 130),
  ('KITCHEN', '정수기', 140),
  ('BALCONY_FRONT', '화분', 10),
  ('BALCONY_FRONT', '항아리', 20),
  ('BALCONY_FRONT', '운동기구', 30),
  ('BALCONY_FRONT', '자전거', 40),
  ('BALCONY_BACK', '세탁기/건조기', 10),
  ('ETC', '신발류', 10);

-- 방 틀에 쓰는 물품이 사전에 없으면 추가(기본 부피는 비워 둔다 — 견적 때 입력)
INSERT INTO "cbm_item" ("id", "category", "name", "name_eng", "sort_order", "is_active", "created_at")
SELECT gen_random_uuid(), t.category, t.name, t.name_eng, t.ord, true, now()
FROM _seed_item t WHERE NOT EXISTS (SELECT 1 FROM "cbm_item" c WHERE c."name" = t.name);
UPDATE "cbm_item" c SET "name_eng" = t.name_eng FROM _seed_item t WHERE c."name" = t.name AND c."name_eng" IS NULL;

-- 코드 발급(만든 순서대로 ITM-0001 …)
UPDATE "cbm_item" c SET "code" = 'ITM-' || LPAD(x.rn::TEXT, 4, '0')
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "name") AS rn FROM "cbm_item") x
WHERE c."id" = x."id";
ALTER TABLE "cbm_item" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "cbm_item_code_key" ON "cbm_item"("code");
CREATE UNIQUE INDEX "cbm_item_name_key" ON "cbm_item"("name");

-- ── 방 틀 ──
CREATE TABLE "room_template" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_eng" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "room_template_code_key" ON "room_template"("code");
CREATE UNIQUE INDEX "room_template_name_key" ON "room_template"("name");

CREATE TABLE "room_template_item" (
    "room_id" UUID NOT NULL,
    "cbm_item_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "room_template_item_pkey" PRIMARY KEY ("room_id","cbm_item_id")
);
ALTER TABLE "room_template_item" ADD CONSTRAINT "room_template_item_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_template_item" ADD CONSTRAINT "room_template_item_cbm_item_id_fkey" FOREIGN KEY ("cbm_item_id") REFERENCES "cbm_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "room_template" ("id", "code", "name", "name_eng", "sort_order")
SELECT gen_random_uuid(), t.code, t.name, t.name_eng, t.ord FROM _seed_room t;
INSERT INTO "room_template_item" ("room_id", "cbm_item_id", "sort_order")
SELECT r."id", c."id", t.ord
FROM _seed_room_item t JOIN "room_template" r ON r."code" = t.room_code JOIN "cbm_item" c ON c."name" = t.item_name
ON CONFLICT DO NOTHING;

DROP TABLE _seed_item; DROP TABLE _seed_room; DROP TABLE _seed_room_item;

-- ── 처리방법 ──
CREATE TABLE "handling_method" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "handling_method_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "handling_method_code_key" ON "handling_method"("code");
CREATE UNIQUE INDEX "handling_method_name_key" ON "handling_method"("name");
INSERT INTO "handling_method" ("id", "code", "name", "bucket", "sort_order") VALUES
  (gen_random_uuid(), 'CARRY',   '운반', 'MOVING',   10),
  (gen_random_uuid(), 'DISPOSE', '폐기', 'DISCARD',  20),
  (gen_random_uuid(), 'UNLOAD',  '하역', 'DISCARD',  30),
  (gen_random_uuid(), 'VIA',     '경유', 'TRANSIT',  40),
  (gen_random_uuid(), 'LEAVE',   '방치', 'EXCLUDED', 50),
  (gen_random_uuid(), 'VENDOR',  '업체', 'EXCLUDED', 60);

-- ── 견적: 톤 견적 · 3단계 저장 여부 ──
ALTER TABLE "estimate" ADD COLUMN "options_saved_at" TIMESTAMPTZ(6),
ADD COLUMN "total_ton" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "volume_unit" TEXT NOT NULL DEFAULT 'CBM';
ALTER TABLE "estimate_line" ADD COLUMN "ton" DECIMAL(8,2);
-- 이미 옵션을 저장한 견적은 '저장함'으로(기본선택 상품을 다시 체크하지 않게)
UPDATE "estimate" e SET "options_saved_at" = now()
WHERE EXISTS (SELECT 1 FROM "estimate_addon" a WHERE a."estimate_id" = e."id");

-- ── 상품 구성 ──
ALTER TABLE "addon_service" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SERVICE';
ALTER TABLE "estimate_addon" ADD COLUMN "is_extra" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "product_addon" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'OPTIONAL',
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- '이사물량' 상품 — 물품정보(방·물품·처리방법)로 물량을 잡고 CBM·톤당 단가로 견적하는 특별 상품
INSERT INTO "addon_service" ("id", "code", "name", "unit", "group_code", "kind", "sort_order", "is_active", "created_at")
SELECT gen_random_uuid(),
       'OPT-' || LPAD((COALESCE((SELECT MAX(SUBSTRING("code" FROM '^OPT-(\d+)$')::INT) FROM "addon_service"), 0) + 1)::TEXT, 4, '0'),
       '이사물량', 'EA', 'ETC', 'VOLUME', 0, true, now()
WHERE NOT EXISTS (SELECT 1 FROM "addon_service" WHERE "name" = '이사물량');
UPDATE "addon_service" SET "kind" = 'VOLUME', "sort_order" = 0 WHERE "name" = '이사물량';

-- 이사 계열 구성(가정이사 등)에 이사물량 = 필수, 기존 옵션 전부 = 선택(지금까지처럼 모두 고를 수 있게)
INSERT INTO "product_addon" ("product_id", "addon_service_id", "role", "sort_order", "created_at")
SELECT p."id", s."id", CASE WHEN s."kind" = 'VOLUME' THEN 'REQUIRED' ELSE 'OPTIONAL' END, s."sort_order", now()
FROM "product" p CROSS JOIN "addon_service" s
WHERE p."service_line" IN ('MOVING', 'B2B_MOVING') AND s."is_active"
ON CONFLICT ("product_id", "addon_service_id") DO NOTHING;
