-- CreateTable
CREATE TABLE "attendance_record" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "clock_in" TIMESTAMPTZ(6),
    "clock_out" TIMESTAMPTZ(6),
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_record_work_date_idx" ON "attendance_record"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_employee_id_work_date_key" ON "attendance_record"("employee_id", "work_date");

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
