import { Module } from '@nestjs/common';
import { DriveModule } from '../drive/drive.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarEventService } from './calendar-event.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  // 구글 리디렉션 주소를 같이 쓴다 — 드라이브 연결 콜백도 여기로 온다
  imports: [DriveModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarEventService, GoogleCalendarService],
  exports: [CalendarEventService, GoogleCalendarService],
})
export class CalendarModule {}
