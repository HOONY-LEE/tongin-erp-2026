-- 경영관리 대시보드(대표·경영관리 기본 템플릿) 배치 정리
--  맨 위: 카드 4개(매출·계약·전환율·수금률) / 그 아래: 매출 추이 + 결재할 문서 / '내 알림'은 뺀다(헤더 알림과 겹침)
--  나머지는 순서 그대로 아래로. 관리자가 이미 '내 알림'을 뺐거나 고친 템플릿(내 알림이 없는)은 건드리지 않는다.
UPDATE "dashboard" d
SET "layout" = jsonb_set(d."layout", '{items}', (
  SELECT COALESCE(jsonb_agg(
    e || CASE e->>'widget'
      WHEN 'kpi.revenue'            THEN '{"x":0,"y":0,"w":3,"h":2}'::jsonb
      WHEN 'kpi.contracts'          THEN '{"x":3,"y":0,"w":3,"h":2}'::jsonb
      WHEN 'kpi.conversion'         THEN '{"x":6,"y":0,"w":3,"h":2}'::jsonb
      WHEN 'kpi.collectionRate'     THEN '{"x":9,"y":0,"w":3,"h":2}'::jsonb
      WHEN 'revenue.trend'          THEN '{"x":0,"y":2,"w":8,"h":5}'::jsonb
      WHEN 'approval.pending'       THEN '{"x":8,"y":2,"w":4,"h":5}'::jsonb
      WHEN 'kpi.outstanding'        THEN '{"x":0,"y":7,"w":6,"h":2}'::jsonb
      WHEN 'kpi.collected'          THEN '{"x":6,"y":7,"w":6,"h":2}'::jsonb
      -- 그 아래(지역·지점·서비스 줄부터)는 예전 y=10 → 9(맨 위 4줄이 빠지고 3줄이 늘어 한 줄 위로)
      ELSE jsonb_build_object('y', GREATEST((e->>'y')::int - 1, 9))
    END
  ORDER BY (e->>'y')::int, (e->>'x')::int), '[]'::jsonb)
  FROM jsonb_array_elements(d."layout"->'items') e
  WHERE e->>'widget' <> 'inbox.recent'
))
WHERE d."owner_user_id" IS NULL
  AND d."name" = '경영관리 대시보드'
  AND d."layout"::text LIKE '%"inbox.recent"%';
