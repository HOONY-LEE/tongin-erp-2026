-- CreateTable
CREATE TABLE "notice" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "author_emp_id" UUID,
    "author_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_org_unit" (
    "notice_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,

    CONSTRAINT "notice_org_unit_pkey" PRIMARY KEY ("notice_id","org_unit_id")
);

-- CreateTable
CREATE TABLE "team_task" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "team_org_id" UUID NOT NULL,
    "assignee_emp_id" UUID,
    "requester_emp_id" UUID,
    "project" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'B',
    "due_date" DATE,
    "done_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "team_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corp_asset" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "counterparty" TEXT,
    "ref_no" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "amount" DECIMAL(14,2),
    "amount_unit" TEXT,
    "manager_emp_id" UUID,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "corp_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_case" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "occurred_at" DATE NOT NULL,
    "due_date" DATE,
    "assignee_emp_id" UUID,
    "amount" DECIMAL(14,2),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_case_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notice_pinned_created_at_idx" ON "notice"("pinned", "created_at");

-- CreateIndex
CREATE INDEX "notice_org_unit_org_unit_id_idx" ON "notice_org_unit"("org_unit_id");

-- CreateIndex
CREATE INDEX "team_task_team_org_id_status_idx" ON "team_task"("team_org_id", "status");

-- CreateIndex
CREATE INDEX "team_task_assignee_emp_id_idx" ON "team_task"("assignee_emp_id");

-- CreateIndex
CREATE INDEX "team_task_requester_emp_id_idx" ON "team_task"("requester_emp_id");

-- CreateIndex
CREATE INDEX "corp_asset_end_date_idx" ON "corp_asset"("end_date");

-- CreateIndex
CREATE INDEX "branch_case_branch_id_occurred_at_idx" ON "branch_case"("branch_id", "occurred_at");

-- CreateIndex
CREATE INDEX "branch_case_status_idx" ON "branch_case"("status");

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_author_emp_id_fkey" FOREIGN KEY ("author_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_org_unit" ADD CONSTRAINT "notice_org_unit_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_org_unit" ADD CONSTRAINT "notice_org_unit_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task" ADD CONSTRAINT "team_task_team_org_id_fkey" FOREIGN KEY ("team_org_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task" ADD CONSTRAINT "team_task_assignee_emp_id_fkey" FOREIGN KEY ("assignee_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task" ADD CONSTRAINT "team_task_requester_emp_id_fkey" FOREIGN KEY ("requester_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corp_asset" ADD CONSTRAINT "corp_asset_manager_emp_id_fkey" FOREIGN KEY ("manager_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_case" ADD CONSTRAINT "branch_case_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_case" ADD CONSTRAINT "branch_case_assignee_emp_id_fkey" FOREIGN KEY ("assignee_emp_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
