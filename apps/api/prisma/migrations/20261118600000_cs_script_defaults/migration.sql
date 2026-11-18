-- 상담 메모 기본 대본 다듬기 — 공유 메모 중 같은 제목의 내용을 새 대본으로 바꾼다(2026-11-18)
-- 공유 칸이 생기기 전에 만든 기본 대본은 개인 메모(shared=false)로 남아 있다 → 제목마다 가장 먼저 만든 하나를 공유로 올리고,
-- 손대지 않은 같은 제목의 다른 사본(예전 기본 문구 그대로)은 지운다. 직접 고친 사본은 그대로 둔다.
UPDATE "cs_script" SET "shared" = true WHERE "id" = (SELECT "id" FROM "cs_script" WHERE "title" = '첫 인사' ORDER BY "shared" DESC, "created_at" ASC LIMIT 1);
DELETE FROM "cs_script" WHERE "title" = '첫 인사' AND "shared" = false AND "body" = '안녕하세요, 통인익스프레스 ○○○입니다. 무엇을 도와드릴까요?

(이사 문의면) 이사 예정일과 출발지·도착지를 여쭤봐도 될까요?';
UPDATE "cs_script" SET "shared" = true WHERE "id" = (SELECT "id" FROM "cs_script" WHERE "title" = '견적 안내' ORDER BY "shared" DESC, "created_at" ASC LIMIT 1);
DELETE FROM "cs_script" WHERE "title" = '견적 안내' AND "shared" = false AND "body" = '정확한 견적을 위해 방문 견적을 도와드리고 있습니다.
방문 가능한 날짜와 시간대를 알려 주시면 담당자가 연락드리겠습니다.';
UPDATE "cs_script" SET "shared" = true WHERE "id" = (SELECT "id" FROM "cs_script" WHERE "title" = '제휴·전속 확인' ORDER BY "shared" DESC, "created_at" ASC LIMIT 1);
DELETE FROM "cs_script" WHERE "title" = '제휴·전속 확인' AND "shared" = false AND "body" = '혹시 소속 회사나 기관에서 받으신 제휴 혜택이 있으실까요?
(제휴사 이름을 확인하고, 전속이면 본사로 배정)';
UPDATE "cs_script" SET "shared" = true WHERE "id" = (SELECT "id" FROM "cs_script" WHERE "title" = '마무리' ORDER BY "shared" DESC, "created_at" ASC LIMIT 1);
DELETE FROM "cs_script" WHERE "title" = '마무리' AND "shared" = false AND "body" = '접수해 드렸습니다. 담당자가 곧 연락드릴 예정입니다.
더 궁금하신 점 있으시면 언제든 연락 주세요. 감사합니다.';
-- 새 대본으로 바꾸기(공유 메모)
UPDATE "cs_script" SET "body" = '[이번 주 공지] — 상담 전에 한 번 확인해 주세요. (내용은 바뀔 때마다 고쳐 주세요)

■ 예약 마감·혼잡일
· 월말(25일~말일)·손 없는 날·주말은 예약이 빨리 찹니다 → 희망일이 이 날짜면 “일정이 빨리 마감되는 날”이라고 먼저 안내
· 마감된 날짜는 대안 날짜 2개를 바로 제시

■ 진행 중인 제휴·프로모션
· (예) ○○카드 제휴 — 이사 비용 ○% 할인, ○월 ○일까지
· (예) 전속 고객사 ○○ — 본사 배정만 가능

■ 응대 원칙
· 금액은 전화로 확정하지 않습니다 — “방문(또는 사진) 견적 후 정확히 안내”
· 파손·분실·AS 문의는 접수 번호를 받아 담당 지점으로 연결
· 고객 요청사항은 ‘고객 요청사항’ 칸에, 상담 내용은 ‘상담 메모’ 칸에 나눠 적기' WHERE "shared" = true AND "title" = '공지사항';
UPDATE "cs_script" SET "body" = '안녕하세요, 통인익스프레스 ○○○입니다. 무엇을 도와드릴까요?

(이사 문의일 때) 네, 이사 상담 도와드리겠습니다. 몇 가지만 여쭤볼게요.
1. 고객님 성함이 어떻게 되실까요?
2. 이사 예정일이 정해지셨을까요? (미정이면 희망 시기)
3. 지금 계신 곳(출발지)과 이사 가실 곳(도착지)은 어디세요?
4. 집 구조는 어떻게 되세요? (원룸·투룸·쓰리룸 / 평수 / 층수, 엘리베이터 유무)

(기존 고객이 화면에 뜨면) ○○○ 고객님, 다시 연락 주셔서 감사합니다. 지난번 ○○ 건 관련이실까요?' WHERE "shared" = true AND "title" = '첫 인사';
UPDATE "cs_script" SET "body" = '정확한 견적을 위해 담당자가 방문(또는 영상·사진)으로 짐 양을 확인한 뒤 안내해 드리고 있습니다.

· 방문 견적은 무료이고 20~30분 정도 걸립니다.
· 방문 가능한 날짜와 시간대를 말씀해 주시면 담당 지점에서 일정 잡아 연락드립니다.
· 견적 받으실 때 함께 확인하면 좋은 것
  - 대형 가구·가전(장롱, 냉장고, 피아노, 안마의자 등)
  - 에어컨 이전 설치, 붙박이장·시스템 행거 해체
  - 사다리차 필요 여부(층수, 엘리베이터 사용 가능 시간)
  - 폐기물 처리, 입주 청소 필요 여부

(금액을 물으시면) 짐 양과 작업 조건에 따라 달라서, 방문 견적 후 정확한 금액을 서면으로 안내드리겠습니다.' WHERE "shared" = true AND "title" = '견적 안내';
UPDATE "cs_script" SET "body" = '혹시 다니시는 회사나 이용 중인 카드·기관에서 받으신 이사 제휴 혜택이 있으실까요?

· 있다고 하시면 → 제휴사 이름을 여쭤보고 ‘상품 종류’에서 제휴/전속을 골라 해당 업체 선택
  - 화면에 나오는 혜택 내용을 그대로 안내 (할인율·기간 등)
  - 증빙(사원증·제휴 코드·쿠폰 번호)이 필요한 곳이면 견적 때 준비해 달라고 안내
· 전속 고객사 → 본사에서만 진행합니다(담당 지점을 본사로).
· 제휴 고객사 → 가까운 지점·가맹점까지 배정할 수 있습니다.
· 목록에 없는 곳이면 → 일반으로 접수하고 상담 메모에 업체명을 적어 두기' WHERE "shared" = true AND "title" = '제휴·전속 확인';
UPDATE "cs_script" SET "body" = '말씀하신 내용으로 접수해 드렸습니다. 접수 번호는 ○○○○입니다.

· 담당 지점에서 오늘(늦어도 내일) 중 연락드려 방문 견적 일정을 잡아 드립니다.
· 접수 안내 문자도 곧 보내 드릴게요.
· 일정이나 주소가 바뀌면 이 번호로 다시 연락 주시면 바로 반영해 드리겠습니다.

더 궁금하신 점 있으실까요? 통인익스프레스를 찾아 주셔서 감사합니다. 좋은 하루 보내세요.' WHERE "shared" = true AND "title" = '마무리';
