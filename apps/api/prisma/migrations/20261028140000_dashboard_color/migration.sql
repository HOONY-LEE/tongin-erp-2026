-- 대시보드(템플릿) 색 — 통인 테마색(tongin) 또는 애플 시스템 색 이름
ALTER TABLE "dashboard" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'tongin';
