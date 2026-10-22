-- 옵션 카탈로그 통합 (2026-10-22)
-- 견적 3단계 옵션 목록은 코드(shared ESTIMATE_OPTIONS)에 고정돼 있었고, 상품관리 '옵션' 탭(addon_service)은
-- 견적에서 쓰이지 않았다. 옵션 목록의 원본을 addon_service로 합친다.
--  1) 견적 화면에 필요한 속성(묶음·종류·요청일·내용·순서) 추가
--  2) 기존 고정 옵션 23종을 카탈로그 행으로 넣는다(같은 이름이 이미 있으면 그 행을 쓴다)
--  3) 이미 저장된 견적 옵션(estimate_addon.code)을 카탈로그 행에 연결한다

ALTER TABLE "addon_service" ADD COLUMN     "group_code" TEXT NOT NULL DEFAULT 'ETC',
ADD COLUMN     "has_date" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_note" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variants" JSONB;

CREATE TEMP TABLE _opt_seed (legacy TEXT, name TEXT, group_code TEXT, variants JSONB, has_date BOOLEAN, has_note BOOLEAN, sort_order INT);
INSERT INTO _opt_seed VALUES
  ('LADDER_BEFORE', '사다리차 서비스(전)', 'LADDER', NULL, false, false, 10),
  ('LADDER_AFTER', '사다리차 서비스(후)', 'LADDER', NULL, false, false, 20),
  ('MOVE_IN_CLEANING', '입주청소서비스', 'LIVING', '[{"value": "STANDARD", "label": "일반"}, {"value": "PREMIUM", "label": "프리미엄"}]'::jsonb, true, false, 30),
  ('APPLIANCE_CLEANING', '가전청소서비스', 'LIVING', '[{"value": "AIRCON", "label": "에어컨"}, {"value": "WASHER", "label": "세탁기"}]'::jsonb, true, false, 40),
  ('ORGANIZING', '정리수납서비스', 'LIVING', '[{"value": "STANDARD", "label": "일반"}, {"value": "VIP", "label": "VIP"}]'::jsonb, true, false, 50),
  ('DEODORIZING', '탈취살균(새집증후군)서비스', 'LIVING', NULL, true, false, 60),
  ('PIPE_CARE', '배관케어서비스', 'LIVING', NULL, true, false, 70),
  ('MATTRESS_CARE', '매트리스케어', 'LIVING', NULL, true, false, 80),
  ('APRON', '에이프런서비스', 'LIVING', NULL, true, false, 90),
  ('MOVJE_DIRECTOR', '무브제 디렉터 상담', 'LIVING', NULL, true, false, 100),
  ('OTHER_SERVICE', '기타서비스', 'LIVING', NULL, true, true, 110),
  ('ASM_WARDROBE_NORMAL', '일반 장롱', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 120),
  ('ASM_WARDROBE_SLIDE', '슬라이드 장롱', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 130),
  ('ASM_SYSTEM_HANGER', '시스템 행거', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 140),
  ('ASM_DESK_SET', '책상/책장 세트', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 150),
  ('ASM_WALL_TV', '벽걸이 TV', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 160),
  ('ASM_AIRCON', '에어컨', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 170),
  ('ASM_FRIDGE', '정수기/냉장고', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 180),
  ('ASM_STONE_BED_SINGLE', '돌침대(싱글)', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 190),
  ('ASM_STONE_BED_DOUBLE', '돌침대(더블)', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 200),
  ('ASM_SAFE', '금고', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, false, 210),
  ('ASM_ETC', '기타', 'ASSEMBLY', '[{"value": "BOTH", "label": "분해·설치"}, {"value": "DISASSEMBLE", "label": "분해만"}, {"value": "INSTALL", "label": "설치만"}]'::jsonb, false, true, 220),
  ('STORAGE', '보관비용', 'ETC', NULL, false, true, 230);

-- 이름이 같은 옵션이 이미 있으면 그 행에 속성만 입힌다
UPDATE "addon_service" s SET "group_code" = t.group_code, "variants" = t.variants,
  "has_date" = t.has_date, "has_note" = t.has_note, "sort_order" = t.sort_order
FROM _opt_seed t WHERE s."name" = t.name;

-- 없는 옵션은 새로 넣는다. 코드는 기존 OPT-번호 뒤로 이어서 발급
INSERT INTO "addon_service" ("id", "code", "name", "unit", "group_code", "variants", "has_date", "has_note", "sort_order", "is_active", "created_at")
SELECT gen_random_uuid(),
       'OPT-' || LPAD((COALESCE((SELECT MAX(SUBSTRING("code" FROM '^OPT-(\d+)$')::INT) FROM "addon_service"), 0)
                      + ROW_NUMBER() OVER (ORDER BY t.sort_order))::TEXT, 4, '0'),
       t.name, CASE WHEN t.group_code = 'ASSEMBLY' THEN 'EA' ELSE 'FLAT' END,
       t.group_code, t.variants, t.has_date, t.has_note, t.sort_order, true, now()
FROM _opt_seed t
WHERE NOT EXISTS (SELECT 1 FROM "addon_service" s WHERE s."name" = t.name);

-- 저장돼 있던 견적 옵션을 카탈로그에 연결하고, 코드 스냅샷도 카탈로그 코드로 맞춘다
UPDATE "estimate_addon" ea SET "addon_service_id" = s."id", "code" = s."code"
FROM _opt_seed t JOIN "addon_service" s ON s."name" = t.name
WHERE ea."code" = t.legacy AND ea."addon_service_id" IS NULL;

DROP TABLE _opt_seed;
