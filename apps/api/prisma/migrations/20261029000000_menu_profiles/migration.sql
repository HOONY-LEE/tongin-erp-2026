-- 메뉴 구성(팀·권한 그룹·직책·개인별 사이드바) + 개인 메뉴 설정
CREATE TABLE "menu_profile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layout" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "menu_profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_profile_target" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    CONSTRAINT "menu_profile_target_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_menu_pref" (
    "user_id" UUID NOT NULL,
    "layout" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "user_menu_pref_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "menu_profile_target_profile_id_kind_target_id_key" ON "menu_profile_target"("profile_id", "kind", "target_id");
CREATE INDEX "menu_profile_target_kind_target_id_idx" ON "menu_profile_target"("kind", "target_id");

ALTER TABLE "menu_profile_target" ADD CONSTRAINT "menu_profile_target_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "menu_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
