import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StubNotificationProvider } from '../../notifications/notification.provider';
import { CreateCampaignDto } from './dto/create-campaign.dto';

/** MKT-01: 문자/알림톡 마케팅 캠페인 — 세그먼트 타겟 대량발송(스텁 발송 + 건별 기록). */
@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: StubNotificationProvider,
  ) {}

  findAll() {
    return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async findOne(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`캠페인을 찾을 수 없습니다: ${id}`);
    return c;
  }

  create(dto: CreateCampaignDto) {
    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        channel: dto.channel ?? 'SMS',
        message: dto.message,
        targetGrade: dto.targetGrade,
      },
    });
  }

  /** 대상 고객(전화 보유 + 등급 필터) 수 미리보기. */
  async previewCount(id: string) {
    const c = await this.findOne(id);
    const count = await this.prisma.customer.count({ where: this.targetWhere(c.targetGrade) });
    return { count };
  }

  /** 발송: 대상 고객별 스텁 발송 + notification 건별 기록, 캠페인 SENT 처리. */
  async send(id: string) {
    const c = await this.findOne(id);
    if (c.status === 'SENT') throw new BadRequestException('이미 발송된 캠페인입니다.');

    const customers = await this.prisma.customer.findMany({
      where: this.targetWhere(c.targetGrade),
      select: { id: true, phonePrimary: true },
    });
    if (customers.length === 0) throw new BadRequestException('발송 대상 고객이 없습니다.');

    for (const cust of customers) {
      const res = await this.provider.send(c.channel, cust.phonePrimary, c.message);
      await this.prisma.notification.create({
        data: {
          channel: c.channel,
          eventType: 'campaign',
          recipient: cust.phonePrimary,
          message: c.message,
          status: res.ok ? 'SENT' : 'FAILED',
          payload: { campaignId: c.id, customerId: cust.id },
        },
      });
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'SENT', recipientCount: customers.length, sentAt: new Date() },
    });
  }

  private targetWhere(targetGrade: string | null) {
    return {
      phonePrimary: { not: null },
      ...(targetGrade ? { grade: targetGrade } : {}),
    };
  }
}
