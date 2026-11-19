-- 상담 메모 프리셋(상담 화면 상담 메모에 불러 쓰는 틀)
CREATE TABLE "cs_memo_preset" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cs_memo_preset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cs_memo_preset_sort_order_idx" ON "cs_memo_preset"("sort_order");

-- 기본 프리셋
INSERT INTO "cs_memo_preset" ("id", "title", "body", "sort_order", "updated_at") VALUES
(gen_random_uuid(), '기본', '', 0, CURRENT_TIMESTAMP),
(gen_random_uuid(), '클레임', '[클레임]
- 이사일·작업팀:
- 클레임 내용(파손·분실·지연·응대 등):
- 고객 요청(보상·재작업·사과 등):
- 증빙(사진·영상): 받음 / 안 받음
- 전달 대상(지점·팀):
- 다음 연락·처리 기한:', 1, CURRENT_TIMESTAMP),
(gen_random_uuid(), '반려', '[반려]
- 반려 사유:
- 고객에게 안내한 내용:
- 대안 제시(다른 날짜·상품):
- 다음 연락:', 2, CURRENT_TIMESTAMP),
(gen_random_uuid(), '해피콜', '[해피콜]
- 전체 만족도(매우 만족·만족·보통·불만):
- 작업팀 친절·시간 준수:
- 파손·분실: 없음 / 있음(내용: )
- 정리·청소 상태:
- 개선 의견:
- 후기·추천 의향:', 3, CURRENT_TIMESTAMP),
(gen_random_uuid(), '이사확인콜', '[이사 확인콜]
- 이사일·시작 시간:
- 출발지·도착지 주소:
- 짐 변동(추가·제외):
- 엘리베이터·사다리차·주차:
- 잔금·결제 방법:
- 특이사항(귀중품·파손 주의 물품):', 4, CURRENT_TIMESTAMP),
(gen_random_uuid(), '작업확인콜', '[작업 확인콜]
- 작업일·시간:
- 작업 장소·출입 방법:
- 작업 범위(물품·수량):
- 고객 준비 사항:
- 작업팀·담당자 안내:
- 특이사항:', 5, CURRENT_TIMESTAMP);
