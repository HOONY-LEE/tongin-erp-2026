-- 리빙·케어 메뉴를 없애고 모든 접수를 접수 화면에서 — 서비스 주문(service_order)을 접수(lead)로 옮긴다.
-- 번호는 접수 번호(RC+날짜+일련)로 새로 붙이고, 옛 번호는 legacy_no에 남긴다(옛 번호로도 찾게).
-- 상태: 요청→접수, 일정 확정→계약, 완료→작업완료, 취소→취소. 상품 이름은 상품 특이사항으로.
INSERT INTO "lead" (
  "id", "lead_no", "legacy_no", "customer_id", "org_unit_id", "owner_emp_id", "service_line", "status",
  "from_addr", "move_date", "expected_amount", "customer_request", "product_note", "created_at"
)
SELECT
  gen_random_uuid(),
  next_doc_no('RC', (so."created_at" AT TIME ZONE 'Asia/Seoul')::date),
  COALESCE(so."legacy_no", so."order_no"),
  so."customer_id",
  so."org_unit_id",
  so."assigned_emp_id",
  so."service_line",
  CASE so."status"
    WHEN 'REQUESTED' THEN 'RECEIVED'
    WHEN 'SCHEDULED' THEN 'CONTRACTED'
    WHEN 'DONE' THEN 'DONE'
    ELSE 'CANCELED'
  END,
  so."address",
  so."scheduled_date",
  so."amount",
  so."note",
  (SELECT p."name" FROM "product" p WHERE p."id" = so."product_id"),
  so."created_at"
FROM "service_order" so
WHERE NOT EXISTS (
  SELECT 1 FROM "lead" l WHERE l."legacy_no" = COALESCE(so."legacy_no", so."order_no")
)
ORDER BY so."created_at";

-- 옮긴 주문은 지운다(고객 이력에 같은 건이 두 번 나오지 않게)
DELETE FROM "service_order" so
WHERE EXISTS (
  SELECT 1 FROM "lead" l WHERE l."legacy_no" = COALESCE(so."legacy_no", so."order_no")
);
