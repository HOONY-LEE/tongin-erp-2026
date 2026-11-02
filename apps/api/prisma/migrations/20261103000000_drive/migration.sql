-- 드라이브: 공간(내·조직·공유)·항목(폴더·파일·링크)·내용·공유·중요·최근, 구글 드라이브 연결
-- CreateTable
CREATE TABLE "drive_space" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_user_id" UUID,
    "org_unit_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "drive_space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_space_member" (
    "space_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "drive_space_member_pkey" PRIMARY KEY ("space_id","employee_id")
);

-- CreateTable
CREATE TABLE "drive_item" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER,
    "google_file_id" TEXT,
    "url" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "trashed_at" TIMESTAMPTZ(6),
    "trashed_by" UUID,

    CONSTRAINT "drive_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_content" (
    "item_id" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "drive_content_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "drive_share" (
    "item_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_share_pkey" PRIMARY KEY ("item_id","employee_id")
);

-- CreateTable
CREATE TABLE "drive_star" (
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,

    CONSTRAINT "drive_star_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "drive_recent" (
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_recent_pkey" PRIMARY KEY ("user_id","item_id")
);

-- CreateTable
CREATE TABLE "google_drive_link" (
    "user_id" UUID NOT NULL,
    "google_email" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_expiry" TIMESTAMPTZ(6),
    "scope" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_drive_link_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_space_owner_user_id_key" ON "drive_space"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drive_space_org_unit_id_key" ON "drive_space"("org_unit_id");

-- CreateIndex
CREATE INDEX "drive_space_member_employee_id_idx" ON "drive_space_member"("employee_id");

-- CreateIndex
CREATE INDEX "drive_item_space_id_parent_id_idx" ON "drive_item"("space_id", "parent_id");

-- CreateIndex
CREATE INDEX "drive_item_trashed_at_idx" ON "drive_item"("trashed_at");

-- CreateIndex
CREATE INDEX "drive_share_employee_id_idx" ON "drive_share"("employee_id");

-- CreateIndex
CREATE INDEX "drive_recent_user_id_opened_at_idx" ON "drive_recent"("user_id", "opened_at");

-- AddForeignKey
ALTER TABLE "drive_space_member" ADD CONSTRAINT "drive_space_member_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "drive_space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_item" ADD CONSTRAINT "drive_item_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "drive_space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_item" ADD CONSTRAINT "drive_item_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "drive_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_content" ADD CONSTRAINT "drive_content_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "drive_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_share" ADD CONSTRAINT "drive_share_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "drive_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_star" ADD CONSTRAINT "drive_star_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "drive_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_recent" ADD CONSTRAINT "drive_recent_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "drive_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 이미 있는 메뉴 구성에 '드라이브'를 결재함 바로 뒤에 넣는다(결재함이 든 묶음, 아직 없을 때만)
UPDATE "menu_profile" p
SET "layout" = jsonb_set(p."layout", '{groups}', (
  SELECT jsonb_agg(
    CASE WHEN g->'items' ? 'approvals' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(x ORDER BY o)
      FROM (
        SELECT e AS x, i * 2 AS o FROM jsonb_array_elements(g->'items') WITH ORDINALITY t(e, i)
        UNION ALL
        SELECT '"drive"'::jsonb, i * 2 + 1 FROM jsonb_array_elements_text(g->'items') WITH ORDINALITY t(v, i) WHERE v = 'approvals'
      ) s
    )) ELSE g END ORDER BY gi)
  FROM jsonb_array_elements(p."layout"->'groups') WITH ORDINALITY gg(g, gi)
))
WHERE p."layout"::text LIKE '%"approvals"%' AND p."layout"::text NOT LIKE '%"drive"%';
