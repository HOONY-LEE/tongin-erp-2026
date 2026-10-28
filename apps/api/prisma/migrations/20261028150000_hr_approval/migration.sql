-- CreateTable
CREATE TABLE "approval_line_template" (
    "id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "org_unit_id" UUID,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_line_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_doc" (
    "id" UUID NOT NULL,
    "doc_no" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "payload" JSONB,
    "requester_emp_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "current_seq" INTEGER,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_doc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_step" (
    "id" UUID NOT NULL,
    "doc_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "approver_emp_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "comment" TEXT,
    "acted_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_line_template_doc_type_org_unit_id_idx" ON "approval_line_template"("doc_type", "org_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_doc_doc_no_key" ON "approval_doc"("doc_no");

-- CreateIndex
CREATE INDEX "approval_doc_requester_emp_id_idx" ON "approval_doc"("requester_emp_id");

-- CreateIndex
CREATE INDEX "approval_doc_status_idx" ON "approval_doc"("status");

-- CreateIndex
CREATE INDEX "approval_step_approver_emp_id_status_idx" ON "approval_step"("approver_emp_id", "status");

-- CreateIndex
CREATE INDEX "approval_step_doc_id_idx" ON "approval_step"("doc_id");

-- AddForeignKey
ALTER TABLE "approval_doc" ADD CONSTRAINT "approval_doc_requester_emp_id_fkey" FOREIGN KEY ("requester_emp_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "approval_doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_approver_emp_id_fkey" FOREIGN KEY ("approver_emp_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
