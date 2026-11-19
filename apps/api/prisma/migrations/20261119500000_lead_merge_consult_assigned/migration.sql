-- '상담배정'(CONSULT_ASSIGNED)을 '상담토스'(CONSULT_TOSS)로 합친다
UPDATE "lead" SET "status" = 'CONSULT_TOSS' WHERE "status" = 'CONSULT_ASSIGNED';
