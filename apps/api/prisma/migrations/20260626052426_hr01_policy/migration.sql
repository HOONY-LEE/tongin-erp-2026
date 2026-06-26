-- CreateTable
CREATE TABLE "hr_policy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INCENTIVE',
    "target_type" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "calc_type" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "org_scope_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_policy_pkey" PRIMARY KEY ("id")
);
