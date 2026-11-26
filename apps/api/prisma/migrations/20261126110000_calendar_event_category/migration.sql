-- 캘린더 일정 종류(미팅·교육·출장·기타)
ALTER TABLE "calendar_event" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'ETC';
