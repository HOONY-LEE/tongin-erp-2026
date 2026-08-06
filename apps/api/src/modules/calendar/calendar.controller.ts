import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { CalendarService } from './calendar.service';
import { CalendarEventService } from './calendar-event.service';
import {
  CalendarQueryDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar-event.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly events: CalendarEventService,
  ) {}

  /** 기간 내 캘린더 항목(자체 일정 + 작업오더). scope=MINE|ORG */
  @Get('events')
  @RequirePermissions('CALENDAR.READ')
  list(@Query() query: CalendarQueryDto, @CurrentUser() user: AuthPrincipal) {
    return this.events.list(query, user);
  }

  @Post('events')
  @RequirePermissions('CALENDAR.WRITE')
  create(@Body() dto: CreateCalendarEventDto, @CurrentUser() user: AuthPrincipal) {
    return this.events.create(dto, user);
  }

  @Patch('events/:id')
  @RequirePermissions('CALENDAR.WRITE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.events.update(id, dto, user);
  }

  @Delete('events/:id')
  @RequirePermissions('CALENDAR.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.events.remove(id, user);
  }

  /** 조직 필터 드롭다운용 — 내 데이터범위 내 조직 목록. */
  @Get('org-units')
  @RequirePermissions('CALENDAR.READ')
  orgUnits(@CurrentUser() user: AuthPrincipal) {
    return this.events.visibleOrgUnits(user);
  }

  /** 작업(이사) 일정 iCalendar 내보내기. 캘린더 앱에서 가져오기/구독. */
  @Get('work-orders.ics')
  @RequirePermissions('WORK_ORDER.READ')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tongin-schedule.ics"')
  workOrders() {
    return this.calendar.workOrdersIcs();
  }
}
