import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: '배정',
  IN_PROGRESS: '작업중',
  DONE: '완료',
  CANCELED: '취소',
};

/** 작업(이사) 일정을 iCalendar(.ics)로 내보내기 — 캘린더 앱 구독/가져오기용 (INT-03). */
@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async workOrdersIcs(): Promise<string> {
    const orders = await this.prisma.workOrder.findMany({
      where: { scheduledDate: { not: null }, status: { not: 'CANCELED' } },
      include: { lead: { include: { customer: true } } },
      orderBy: { scheduledDate: 'asc' },
      take: 1000,
    });

    const now = ymdHms(new Date());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tongin Express//ERP//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:통인익스프레스 작업일정',
      'X-WR-TIMEZONE:Asia/Seoul',
    ];

    for (const o of orders) {
      const date = o.scheduledDate as Date;
      const start = ymd(date);
      const end = ymd(addDays(date, 1)); // 종일 일정(DTEND는 익일)
      const customer = o.lead?.customer?.name ?? '고객';
      const route = [o.lead?.fromSigungu, o.lead?.toSigungu].filter(Boolean).join('→');
      const summary = `[작업] ${customer}${route ? ` · ${route}` : ''} (${STATUS_LABEL[o.status] ?? o.status})`;
      const location = [o.lead?.fromAddr, o.lead?.fromAddrDetail].filter(Boolean).join(' ');
      const desc = [
        `작업번호: ${o.workNo}`,
        o.lead?.fromAddr ? `출발: ${o.lead.fromAddr}` : null,
        o.lead?.toAddr ? `도착: ${o.lead.toAddr}` : null,
        `상태: ${STATUS_LABEL[o.status] ?? o.status}`,
      ]
        .filter(Boolean)
        .join('\n'); // 실제 개행 → esc()가 iCal \n 으로 변환

      lines.push(
        'BEGIN:VEVENT',
        `UID:wo-${o.id}@tongin-erp`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${esc(summary)}`,
        location ? `LOCATION:${esc(location)}` : '',
        `DESCRIPTION:${esc(desc)}`,
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    // RFC5545: CRLF 줄바꿈, 빈 줄 제거
    return lines.filter((l) => l !== '').join('\r\n') + '\r\n';
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
function ymdHms(d: Date): string {
  return `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
