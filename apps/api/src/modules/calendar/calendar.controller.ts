import { Controller, Get, Header } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** 작업(이사) 일정 iCalendar 내보내기. 캘린더 앱에서 가져오기/구독. */
  @Get('work-orders.ics')
  @RequirePermissions('WORK_ORDER.READ')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tongin-schedule.ics"')
  workOrders() {
    return this.calendar.workOrdersIcs();
  }
}
