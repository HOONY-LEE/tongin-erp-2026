import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StubNotificationProvider } from '../../notifications/notification.provider';

/**
 * 기본 문자 템플릿 — {고객명} {접수번호} {이사일} {상담원}은 보내기 전에 화면이 채운다.
 * 처음 열 때 공유 템플릿으로 한 번 만든다.
 */
const DEFAULT_TEMPLATES: { title: string; body: string }[] = [
  {
    title: '부재 안내',
    body: '[통인익스프레스] {고객명}님, 이사 상담 전화를 드렸으나 연결되지 않았습니다. 편하신 시간에 1899-0123으로 연락 주시면 바로 안내해 드리겠습니다.',
  },
  {
    title: '접수 완료',
    body: '[통인익스프레스] {고객명}님, 이사 상담 접수가 완료되었습니다.\n접수번호: {접수번호}\n담당 지점에서 곧 연락드려 방문 견적 일정을 안내해 드립니다. 감사합니다.',
  },
  {
    title: '방문 견적 안내',
    body: '[통인익스프레스] {고객명}님, 정확한 견적을 위해 담당자가 방문(무료, 20~30분)해 짐 양을 확인해 드립니다. 편하신 날짜와 시간을 회신 주시면 일정 잡아 드리겠습니다.',
  },
  {
    title: '이사 확인콜 부재',
    body: '[통인익스프레스] {고객명}님, {이사일} 이사 확인차 연락드렸으나 통화가 어려웠습니다. 시간·주소·짐 변동이 있으시면 1899-0123으로 알려 주세요.',
  },
  {
    title: '해피콜 부재',
    body: '[통인익스프레스] {고객명}님, 이사는 잘 마치셨을까요? 작업 중 불편하셨던 점이나 파손·분실 문의는 1899-0123으로 연락 주시면 바로 확인해 드리겠습니다.',
  },
  {
    title: '이사일 마감 안내',
    body: '[통인익스프레스] {고객명}님, 문의하신 {이사일}은 예약이 마감되었습니다. 가까운 다른 날짜로 안내해 드릴 수 있으니 1899-0123으로 연락 부탁드립니다.',
  },
];

/** 상담 콘솔 문자 — 템플릿(공유/개인)과 보내기·기록 */
@Injectable()
export class CsSmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: StubNotificationProvider,
  ) {}

  private me(p: AuthPrincipal) {
    if (!p.employeeId) throw new ForbiddenException('직원 계정만 쓸 수 있습니다.');
    return p.employeeId;
  }

  async templates(p: AuthPrincipal) {
    const me = this.me(p);
    const find = () =>
      this.prisma.csSmsTemplate.findMany({
        where: { OR: [{ shared: true }, { employeeId: me }] },
        orderBy: [{ shared: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    const rows = await find();
    if (rows.length) return rows;
    await this.prisma.csSmsTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t, i) => ({ ...t, employeeId: me, shared: true, sortOrder: i })),
    });
    return find();
  }

  async saveTemplate(
    p: AuthPrincipal,
    input: { id?: string; title: string; body: string; shared?: boolean },
  ) {
    const me = this.me(p);
    const data = { title: input.title.trim(), body: input.body, shared: !!input.shared };
    if (input.id) {
      const cur = await this.prisma.csSmsTemplate.findUnique({ where: { id: input.id } });
      if (!cur) throw new NotFoundException('템플릿을 찾을 수 없습니다.');
      if (!cur.shared && cur.employeeId !== me)
        throw new ForbiddenException('내 개인 템플릿만 고칠 수 있습니다.');
      return this.prisma.csSmsTemplate.update({ where: { id: input.id }, data });
    }
    const max = await this.prisma.csSmsTemplate.aggregate({ _max: { sortOrder: true } });
    return this.prisma.csSmsTemplate.create({
      data: { ...data, employeeId: me, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  }

  async deleteTemplate(p: AuthPrincipal, id: string) {
    const me = this.me(p);
    const cur = await this.prisma.csSmsTemplate.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('템플릿을 찾을 수 없습니다.');
    if (!cur.shared && cur.employeeId !== me)
      throw new ForbiddenException('내 개인 템플릿만 지울 수 있습니다.');
    await this.prisma.csSmsTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** 지금 어떤 발송사로·실제로 나가는지(화면 안내) */
  async status() {
    return {
      vendor: this.sms.smsVendor,
      sender: this.sms.smsSender,
      live: this.sms.smsLive,
      restricted: this.sms.restricted,
    };
  }

  /**
   * 문자 보내기 — 허용 번호 제한(시연·SMS_LIVE)은 발송 모듈이 그대로 지킨다.
   * 결과는 성공·실패 모두 기록(고객 이력에 남는다).
   */
  async send(
    p: AuthPrincipal,
    input: { phone: string; body: string; title?: string; callId?: string },
  ) {
    const me = this.me(p);
    const phone = input.phone.replace(/\D/g, '');
    const customer = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer
      WHERE regexp_replace(coalesce(phone_primary, ''), '[^0-9]', '', 'g') = ${phone}
      ORDER BY created_at ASC LIMIT 1`;
    const r = await this.sms.send('SMS', phone, input.body, { title: input.title });
    const log = await this.prisma.csSms.create({
      data: {
        phone,
        customerId: customer[0]?.id ?? null,
        callId: input.callId ?? null,
        title: input.title?.trim() || null,
        body: input.body,
        ok: r.ok,
        reason: r.reason ?? (r.delivered === false ? '연동 전(실제로 나가지 않음)' : null),
        vendor: this.sms.smsVendor,
        employeeId: me,
      },
    });
    return { ok: r.ok, delivered: !!r.delivered, reason: log.reason, id: log.id };
  }
}
