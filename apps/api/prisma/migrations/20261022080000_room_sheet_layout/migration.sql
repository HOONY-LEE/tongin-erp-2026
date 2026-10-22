-- 이사물량 견적표(계약서 2쪽) 양식에 맞춘 방 틀 — 방마다 품목 순서와 '기타' 칸 수를 양식 그대로 둔다.
-- 기본 부피(cbm_item.cbm)는 건드리지 않는다.
ALTER TABLE "room_template" ADD COLUMN "extra_slots" INTEGER NOT NULL DEFAULT 2;

-- 양식에 있는데 사전에 없는 품목(기본 부피는 비워 둔다)
CREATE TEMP TABLE _new_item (name TEXT, name_eng TEXT, category TEXT, ord INT);
INSERT INTO _new_item VALUES ('TV', 'TV', '거실', 205), ('거실장식장', 'Living Room Cabinet', '거실', 295);
INSERT INTO "cbm_item" ("id", "code", "category", "name", "name_eng", "sort_order", "is_active", "created_at")
SELECT gen_random_uuid(),
       'ITM-' || LPAD((COALESCE((SELECT MAX(SUBSTRING("code" FROM 5)::INT) FROM "cbm_item" WHERE "code" ~ '^ITM-[0-9]+$'), 0)
                       + ROW_NUMBER() OVER (ORDER BY t.ord))::TEXT, 4, '0'),
       t.category, t.name, t.name_eng, t.ord, true, now()
FROM _new_item t WHERE NOT EXISTS (SELECT 1 FROM "cbm_item" c WHERE c."name" = t.name);

UPDATE "room_template" SET "name" = '다용도실, 현관, 화장실', "name_eng" = 'UTILITY, ENTRANCE, BATH'
WHERE "code" = 'ETC' AND NOT EXISTS (SELECT 1 FROM "room_template" WHERE "name" = '다용도실, 현관, 화장실');

UPDATE "room_template" SET "extra_slots" = CASE "code"
  WHEN 'MASTER' THEN 5 WHEN 'BED1' THEN 5 WHEN 'BED2' THEN 5 WHEN 'BED3' THEN 5 WHEN 'BED4' THEN 5
  WHEN 'LIVING' THEN 4 WHEN 'KITCHEN' THEN 7 ELSE 2 END;

CREATE TEMP TABLE _sheet (room_code TEXT, item_name TEXT, ord INT);
INSERT INTO _sheet
SELECT r.code, i.name, i.ord * 10
FROM (VALUES ('MASTER'), ('BED1'), ('BED2'), ('BED3'), ('BED4')) AS r(code),
     (VALUES ('장롱', 1), ('이불', 2), ('의류', 3), ('침대', 4), ('협탁', 5), ('책장', 6), ('책', 7),
             ('장식장', 8), ('공기청정기', 9), ('고가구', 10), ('화장대', 11), ('서랍장', 12),
             ('탁자/책상', 13), ('의자', 14), ('TV', 15), ('컴퓨터', 16), ('피아노', 17),
             ('에어컨', 18), ('에어드레서', 19)) AS i(name, ord);
INSERT INTO _sheet VALUES
  ('LIVING', '소파', 10), ('LIVING', '탁자', 20), ('LIVING', '책장', 30), ('LIVING', '책', 40),
  ('LIVING', '책상', 50), ('LIVING', '의자', 60), ('LIVING', 'TV', 70), ('LIVING', '장식장', 80),
  ('LIVING', '에어컨', 90), ('LIVING', '콘솔', 100), ('LIVING', '거실장식장', 110),
  ('LIVING', '에어드레서', 120), ('LIVING', '공기청정기', 130),
  ('KITCHEN', '식탁/의자', 10), ('KITCHEN', '장식장', 20), ('KITCHEN', '수납장', 30),
  ('KITCHEN', '냉장고', 40), ('KITCHEN', '정수기냉장고', 50), ('KITCHEN', '식기세척기', 60),
  ('KITCHEN', '김치냉장고', 70), ('KITCHEN', '가스레인지', 80), ('KITCHEN', '식기류', 90),
  ('KITCHEN', '정수기', 100),
  ('BALCONY_FRONT', '화분', 10), ('BALCONY_FRONT', '항아리', 20), ('BALCONY_FRONT', '자전거', 30),
  ('BALCONY_BACK', '세탁기/건조기', 10),
  ('ETC', '신발류', 10);

DELETE FROM "room_template_item" x USING "room_template" r
WHERE x."room_id" = r."id" AND r."code" IN (SELECT DISTINCT room_code FROM _sheet);

INSERT INTO "room_template_item" ("room_id", "cbm_item_id", "sort_order")
SELECT r."id", c."id", s.ord
FROM _sheet s
JOIN "room_template" r ON r."code" = s.room_code
JOIN "cbm_item" c ON c."name" = s.item_name;
