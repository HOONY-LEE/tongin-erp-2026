-- 반반차(0.25일) — 일수 칸 소수 둘째 자리까지
ALTER TABLE "leave_type" ALTER COLUMN "unit_days" TYPE DECIMAL(4,2);
ALTER TABLE "leave_request" ALTER COLUMN "days" TYPE DECIMAL(5,2);
ALTER TABLE "leave_adjustment" ALTER COLUMN "days" TYPE DECIMAL(5,2);

-- 휴가 신청: 시간대(반차 AM/PM, 반반차 Q1~Q4)·업무 대리인·인수인계·추가 항목
ALTER TABLE "leave_request" ADD COLUMN "slot" TEXT,
ADD COLUMN "substitute_emp_id" UUID,
ADD COLUMN "handover" TEXT,
ADD COLUMN "extra" JSONB;

-- 결재 양식
CREATE TABLE "approval_form" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_form_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_form_kind_is_active_idx" ON "approval_form"("kind", "is_active");

-- 반반차 종류(이미 휴가 종류가 시드된 DB에만 — 새 DB는 시드가 넣는다)
INSERT INTO "leave_type" ("id", "code", "name", "unit_days", "deducts", "paid", "sort_order")
SELECT gen_random_uuid(), 'QUARTER', '반반차', 0.25, true, true, 35
WHERE EXISTS (SELECT 1 FROM "leave_type") AND NOT EXISTS (SELECT 1 FROM "leave_type" WHERE "code" = 'QUARTER');

-- 휴가 신청서(하나뿐) + 자주 쓰는 결재 양식 4가지(관리자가 고치거나 끈다)
INSERT INTO "approval_form" ("id", "kind", "name", "category", "description", "fields", "settings", "sort_order", "updated_at") VALUES
(gen_random_uuid(), 'LEAVE', '휴가 신청서', '인사', '휴가 종류·기간·사유 뒤에 붙는 추가 항목과 업무 대리인 설정',
 '[{"id":"contact","label":"휴가 중 연락처","type":"text","required":false,"placeholder":"급한 일이 있을 때 연락할 번호"}]',
 '{"substitute":"OPTIONAL","reasonRequired":false}', 0, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CUSTOM', '지출 결의서', '재무', '업무로 쓴 비용을 정산받을 때',
 '[{"id":"usedOn","label":"사용일","type":"date","required":true},{"id":"amount","label":"금액","type":"money","required":true},{"id":"account","label":"비용 구분","type":"select","required":true,"options":["교통비","식대","소모품","접대비","기타"]},{"id":"payee","label":"사용처","type":"text","required":true},{"id":"detail","label":"내용","type":"textarea","required":true}]',
 '{}', 10, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CUSTOM', '구매 품의서', '총무', '물품·서비스를 사기 전에',
 '[{"id":"item","label":"품목","type":"text","required":true},{"id":"qty","label":"수량","type":"number","required":true},{"id":"amount","label":"예상 금액","type":"money","required":true},{"id":"vendor","label":"구매처","type":"text","required":false},{"id":"neededBy","label":"필요한 날","type":"date","required":false},{"id":"why","label":"구매 사유","type":"textarea","required":true}]',
 '{}', 20, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CUSTOM', '출장 신청서', '인사', '출장 일정과 경비를 미리 승인받을 때',
 '[{"id":"period","label":"출장 기간","type":"daterange","required":true},{"id":"place","label":"출장지","type":"text","required":true},{"id":"companions","label":"동행자","type":"person","required":false},{"id":"budget","label":"예상 경비","type":"money","required":false},{"id":"purpose","label":"출장 목적","type":"textarea","required":true}]',
 '{}', 30, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CUSTOM', '재택근무 신청서', '인사', '재택·외근으로 일할 때',
 '[{"id":"date","label":"날짜","type":"daterange","required":true},{"id":"kind","label":"근무 형태","type":"select","required":true,"options":["재택","외근","현장 직출·직퇴"]},{"id":"plan","label":"업무 계획","type":"textarea","required":true}]',
 '{}', 40, CURRENT_TIMESTAMP);
