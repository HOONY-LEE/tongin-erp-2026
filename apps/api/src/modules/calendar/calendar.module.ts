import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarEventService } from './calendar-event.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  controllers: [CalendarController],
  providers: [CalendarService, CalendarEventService, GoogleCalendarService],
  exports: [CalendarEventService, GoogleCalendarService],
})
export class CalendarModule {}
