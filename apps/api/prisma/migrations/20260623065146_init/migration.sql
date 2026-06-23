-- CreateTable
CREATE TABLE "org_unit" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_code" (
    "id" UUID NOT NULL,
    "code_group" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "common_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "emp_no" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_primary" TEXT,
    "legacy_id" TEXT,
    "grade" TEXT,
    "status" TEXT,
    "owner_org_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_code_key" ON "org_unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "common_code_code_group_code_key" ON "common_code"("code_group", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_emp_no_key" ON "employee"("emp_no");

-- CreateIndex
CREATE INDEX "customer_phone_primary_idx" ON "customer"("phone_primary");

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
