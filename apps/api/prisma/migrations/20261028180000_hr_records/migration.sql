-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "addr" TEXT,
ADD COLUMN     "addr_detail" TEXT,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergency_name" TEXT,
ADD COLUMN     "emergency_phone" TEXT,
ADD COLUMN     "emergency_relation" TEXT,
ADD COLUMN     "employment_type" TEXT NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "resign_date" DATE,
ADD COLUMN     "resign_reason" TEXT,
ADD COLUMN     "zipcode" TEXT;

-- CreateTable
CREATE TABLE "hr_checklist_template" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_checklist_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_checklist_item" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "done_at" TIMESTAMPTZ(6),
    "done_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from_org_id" UUID,
    "to_org_id" UUID,
    "from_position_id" UUID,
    "to_position_id" UUID,
    "effective_date" DATE NOT NULL,
    "note" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_checklist_item_employee_id_kind_idx" ON "employee_checklist_item"("employee_id", "kind");

-- CreateIndex
CREATE INDEX "employee_history_employee_id_effective_date_idx" ON "employee_history"("employee_id", "effective_date");

-- AddForeignKey
ALTER TABLE "employee_checklist_item" ADD CONSTRAINT "employee_checklist_item_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_history" ADD CONSTRAINT "employee_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
