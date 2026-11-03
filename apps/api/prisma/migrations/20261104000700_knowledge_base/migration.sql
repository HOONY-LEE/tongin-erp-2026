-- 지식베이스 — 문서 · 개념 · 문서↔개념 · 개념↔개념 관계
CREATE TABLE "knowledge_doc" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ETC',
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_name" TEXT,
    "analyze_status" TEXT NOT NULL DEFAULT 'PENDING',
    "analyze_error" TEXT,
    "analyzed_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "updated_by_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "knowledge_doc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_concept" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TOPIC',
    "description" TEXT,
    CONSTRAINT "knowledge_concept_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_concept_name_key" ON "knowledge_concept"("name");

CREATE TABLE "knowledge_mention" (
    "doc_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    CONSTRAINT "knowledge_mention_pkey" PRIMARY KEY ("doc_id","concept_id")
);
CREATE INDEX "knowledge_mention_concept_id_idx" ON "knowledge_mention"("concept_id");

CREATE TABLE "knowledge_relation" (
    "id" UUID NOT NULL,
    "doc_id" UUID NOT NULL,
    "from_id" UUID NOT NULL,
    "to_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "knowledge_relation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "knowledge_relation_doc_id_idx" ON "knowledge_relation"("doc_id");

ALTER TABLE "knowledge_mention" ADD CONSTRAINT "knowledge_mention_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "knowledge_doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_mention" ADD CONSTRAINT "knowledge_mention_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "knowledge_concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_relation" ADD CONSTRAINT "knowledge_relation_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "knowledge_doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_relation" ADD CONSTRAINT "knowledge_relation_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "knowledge_concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_relation" ADD CONSTRAINT "knowledge_relation_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "knowledge_concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 권한: 지식베이스 올리기·고치기·지우기 — 팀 관리 그룹과 인사 수정 권한이 있는 그룹에
INSERT INTO "permission" ("id", "code", "name")
VALUES
  (gen_random_uuid(), 'KNOWLEDGE.CREATE', '지식베이스 · 등록'),
  (gen_random_uuid(), 'KNOWLEDGE.UPDATE', '지식베이스 · 수정'),
  (gen_random_uuid(), 'KNOWLEDGE.DELETE', '지식베이스 · 삭제')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT DISTINCT r."id", p."id"
FROM "role" r, "permission" p
WHERE p."code" IN ('KNOWLEDGE.CREATE', 'KNOWLEDGE.UPDATE', 'KNOWLEDGE.DELETE')
  AND (r."code" = 'TEAM_MGMT' OR EXISTS (
    SELECT 1 FROM "role_permission" rp JOIN "permission" hp ON hp."id" = rp."permission_id"
    WHERE rp."role_id" = r."id" AND hp."code" = 'HR.UPDATE'))
ON CONFLICT DO NOTHING;

-- 이미 있는 메뉴 구성에 '지식베이스'를 업무분장 뒤에 넣는다(아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'duties' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"knowledge"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'duties'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"duties"%' AND p."layout"::text NOT LIKE '%"knowledge"%';
