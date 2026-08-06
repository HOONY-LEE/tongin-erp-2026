import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarEventService } from './calendar-event.service';

@Module({
  controllers: [CalendarController],
  providers: [CalendarService, CalendarEventService],
  exports: [CalendarEventService],
})
export class CalendarModule {}
