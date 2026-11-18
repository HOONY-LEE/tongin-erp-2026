-- 상담원 PC 전화(브라우저 WebRTC) — 지금 등록된 브라우저의 SIP 주소와 그 토큰 만료 시각
ALTER TABLE "cs_agent" ADD COLUMN "sip_uri" TEXT;
ALTER TABLE "cs_agent" ADD COLUMN "sip_until" TIMESTAMPTZ(6);
