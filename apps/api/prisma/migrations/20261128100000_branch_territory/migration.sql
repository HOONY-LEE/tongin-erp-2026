-- 지점 담당 영역(시·군·구)
CREATE TABLE "branch_territory" (
    "id" UUID NOT NULL,
    "sido" TEXT NOT NULL,
    "sigungu" TEXT NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_territory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_territory_sido_sigungu_key" ON "branch_territory"("sido", "sigungu");
CREATE INDEX "branch_territory_org_unit_id_idx" ON "branch_territory"("org_unit_id");

ALTER TABLE "branch_territory" ADD CONSTRAINT "branch_territory_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
