import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthPrincipal } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JWT_SECRET } from '../../auth/jwt.constants';

const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Asia/Seoul';
/** 캘린더 읽기·쓰기 + 어떤 구글 계정인지 표시용 이메일. */
const SCOPES = ['https://www.googleapis.com/auth/calendar', 'openid', 'email'].join(' ');
const STATE_TTL_MS = 10 * 60 * 1000;

export interface GoogleStatus {
  /** 서버에 OAuth 클라이언트(Client ID/Secret)가 설정되어 있는지 */
  configured: boolean;
  /** 이 사용자가 구글 계정을 연결했는지 */
  connected: boolean;
  googleEmail: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
}

export interface SyncResult {
  imported: number;
  exported: number;
  removed: number;
  syncedAt: string;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function toDateOnly(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * INT-04: 구글 캘린더 연동.
 * 앱 단위 OAuth 클라이언트는 환경변수(GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI),
 * 실제 캘린더 접근 권한은 사용자가 개인 구글 계정으로 각자 동의해 발급받는다.
 * 미설정 시 configured:false 로 응답해 자체 캘린더만 사용하도록 우아하게 동작.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger('GoogleCalendar');

  constructor(private readonly prisma: PrismaService) {}

  private get clientId(): string | undefined {
    return process.env.GOOGLE_CLIENT_ID;
  }
  private get clientSecret(): string | undefined {
    return process.env.GOOGLE_CLIENT_SECRET;
  }
  private get redirectUri(): string {
    return process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/calendar/google/callback';
  }
  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  async status(principal: AuthPrincipal): Promise<GoogleStatus> {
    const link = await this.prisma.googleCalendarLink.findUnique({
      where: { userId: principal.userId },
    });
    return {
      configured: this.configured,
      connected: Boolean(link),
      googleEmail: link?.googleEmail ?? null,
      syncEnabled: link?.syncEnabled ?? false,
      lastSyncAt: link?.lastSyncAt?.toISOString() ?? null,
    };
  }

  /** 사용자를 보낼 구글 동의 화면 URL. */
  authUrl(principal: AuthPrincipal): { url: string } {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId as string,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline', // refresh_token 수령
      prompt: 'consent', // 재연결 시에도 refresh_token 확보
      include_granted_scopes: 'true',
      state: this.signState(principal.userId),
    });
    return { url: `${OAUTH_AUTH_URL}?${params.toString()}` };
  }

  /** 구글 리다이렉트 처리 — code를 토큰으로 교환해 사용자에 연결. */
  async handleCallback(code: string, state: string): Promise<{ googleEmail: string }> {
    this.assertConfigured();
    const userId = this.verifyState(state);

    const token = await this.exchangeCode(code);
    const googleEmail = this.emailFromIdToken(token.id_token) ?? 'unknown';
    const expiry = new Date(Date.now() + token.expires_in * 1000);

    await this.prisma.googleCalendarLink.upsert({
      where: { userId },
      create: {
        userId,
        googleEmail,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiry: expiry,
        scope: token.scope,
      },
      update: {
        googleEmail,
        accessToken: token.access_token,
        // 재동의 시 refresh_token이 없으면 기존 값 유지
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        tokenExpiry: expiry,
        scope: token.scope,
        syncEnabled: true,
      },
    });
    return { googleEmail };
  }

  async disconnect(principal: AuthPrincipal): Promise<void> {
    await this.prisma.googleCalendarLink
      .delete({ where: { userId: principal.userId } })
      .catch(() => undefined);
    // 구글에서 가져온 미러 일정은 함께 제거(자체 생성 일정은 유지)
    await this.prisma.calendarEvent.deleteMany({
      where: { ownerUserId: principal.userId, source: 'GOOGLE' },
    });
  }

  /**
   * 양방향 동기화.
   * 가져오기: 기간 내 구글 이벤트 → CalendarEvent(source=GOOGLE) 업서트
   * 내보내기: 아직 구글에 없는 자체 일정(source=LOCAL) → 구글에 생성
   */
  async sync(principal: AuthPrincipal, from?: string, to?: string): Promise<SyncResult> {
    this.assertConfigured();
    const link = await this.prisma.googleCalendarLink.findUnique({
      where: { userId: principal.userId },
    });
    if (!link) throw new NotFoundException('구글 캘린더가 연결되어 있지 않습니다.');

    const accessToken = await this.validAccessToken(link.id);
    const now = new Date();
    const start = from
      ? toDateOnly(from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = to
      ? toDateOnly(to)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));

    const remote = await this.fetchEvents(accessToken, link.calendarId, start, end);

    // ── 가져오기 ──
    let imported = 0;
    const seen = new Set<string>();
    for (const ev of remote) {
      if (ev.status === 'cancelled') continue;
      const date = ev.start?.date ?? ev.start?.dateTime?.slice(0, 10);
      if (!date) continue;
      seen.add(ev.id);
      const startTime = ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : null;
      const endTime = ev.end?.dateTime ? ev.end.dateTime.slice(11, 16) : null;
      await this.prisma.calendarEvent.upsert({
        where: {
          ownerUserId_googleEventId: { ownerUserId: principal.userId, googleEventId: ev.id },
        },
        create: {
          title: ev.summary ?? '(제목 없음)',
          description: ev.description,
          location: ev.location,
          date: toDateOnly(date),
          startTime,
          endTime,
          color: '#007AFF',
          visibility: 'PRIVATE',
          ownerUserId: principal.userId,
          source: 'GOOGLE',
          googleEventId: ev.id,
          syncedAt: new Date(),
        },
        update: {
          title: ev.summary ?? '(제목 없음)',
          description: ev.description,
          location: ev.location,
          date: toDateOnly(date),
          startTime,
          endTime,
          syncedAt: new Date(),
        },
      });
      imported += 1;
    }

    // ── 구글에서 삭제된 미러 일정 정리 ──
    const mirrors = await this.prisma.calendarEvent.findMany({
      where: {
        ownerUserId: principal.userId,
        source: 'GOOGLE',
        date: { gte: start, lte: end },
      },
      select: { id: true, googleEventId: true },
    });
    const stale = mirrors.filter((m) => m.googleEventId && !seen.has(m.googleEventId));
    if (stale.length) {
      await this.prisma.calendarEvent.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }

    // ── 내보내기(아직 구글에 없는 자체 일정) ──
    const locals = await this.prisma.calendarEvent.findMany({
      where: {
        ownerUserId: principal.userId,
        source: 'LOCAL',
        googleEventId: null,
        date: { gte: start, lte: end },
      },
      take: 500,
    });
    let exported = 0;
    for (const ev of locals) {
      try {
        const created = await this.createRemoteEvent(accessToken, link.calendarId, ev);
        await this.prisma.calendarEvent.update({
          where: { id: ev.id },
          data: { googleEventId: created.id, syncedAt: new Date() },
        });
        exported += 1;
      } catch (e) {
        this.logger.warn(`구글 일정 생성 실패(${ev.title}): ${(e as Error).message}`);
      }
    }

    const syncedAt = new Date();
    await this.prisma.googleCalendarLink.update({
      where: { id: link.id },
      data: { lastSyncAt: syncedAt },
    });

    return {
      imported,
      exported,
      removed: stale.length,
      syncedAt: syncedAt.toISOString(),
    };
  }

  // ── 내부 헬퍼 ──

  private assertConfigured(): void {
    if (!this.configured) {
      throw new BadRequestException(
        '구글 캘린더 연동이 설정되지 않았습니다. 관리자에게 문의하세요(GOOGLE_CLIENT_ID/SECRET 필요).',
      );
    }
  }

  /** state 위변조 방지 — 앱 시크릿으로 HMAC 서명(짧은 만료). */
  private signState(userId: string): string {
    const payload = `${userId}.${Date.now() + STATE_TTL_MS}`;
    const sig = createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
  }

  private verifyState(state: string): string {
    const [encoded, sig] = (state ?? '').split('.');
    if (!encoded || !sig) throw new BadRequestException('잘못된 인증 요청입니다.');
    const payload = Buffer.from(encoded, 'base64url').toString();
    const expected = createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('인증 요청 검증에 실패했습니다.');
    }
    const [userId, expStr] = payload.split('.');
    if (!userId || Number(expStr) < Date.now()) {
      throw new BadRequestException('인증 요청이 만료되었습니다. 다시 시도하세요.');
    }
    return userId;
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId as string,
        client_secret: this.clientSecret as string,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      throw new BadRequestException(`구글 토큰 교환 실패: ${await res.text()}`);
    }
    return (await res.json()) as GoogleTokenResponse;
  }

  /** 만료됐으면 refresh_token으로 재발급. */
  private async validAccessToken(linkId: string): Promise<string> {
    const link = await this.prisma.googleCalendarLink.findUniqueOrThrow({ where: { id: linkId } });
    const stillValid = link.tokenExpiry && link.tokenExpiry.getTime() > Date.now() + 60_000;
    if (stillValid) return link.accessToken;
    if (!link.refreshToken) {
      throw new BadRequestException('구글 인증이 만료되었습니다. 계정을 다시 연결해주세요.');
    }

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId as string,
        client_secret: this.clientSecret as string,
        refresh_token: link.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      throw new BadRequestException('구글 인증 갱신에 실패했습니다. 계정을 다시 연결해주세요.');
    }
    const token = (await res.json()) as GoogleTokenResponse;
    await this.prisma.googleCalendarLink.update({
      where: { id: linkId },
      data: {
        accessToken: token.access_token,
        tokenExpiry: new Date(Date.now() + token.expires_in * 1000),
      },
    });
    return token.access_token;
  }

  private async fetchEvents(
    accessToken: string,
    calendarId: string,
    start: Date,
    end: Date,
  ): Promise<GoogleEvent[]> {
    const items: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'true', // 반복 일정을 개별 인스턴스로 펼침
        maxResults: '250',
        orderBy: 'startTime',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        throw new BadRequestException(`구글 캘린더 조회 실패: ${await res.text()}`);
      }
      const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
      items.push(...(json.items ?? []));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return items;
  }

  private async createRemoteEvent(
    accessToken: string,
    calendarId: string,
    ev: { title: string; description: string | null; location: string | null; date: Date; startTime: string | null; endTime: string | null },
  ): Promise<{ id: string }> {
    const day = ymd(ev.date);
    const body: Record<string, unknown> = {
      summary: ev.title,
      description: ev.description ?? undefined,
      location: ev.location ?? undefined,
    };
    if (ev.startTime) {
      const endTime = ev.endTime ?? addHour(ev.startTime);
      body.start = { dateTime: `${day}T${ev.startTime}:00`, timeZone: TIMEZONE };
      body.end = { dateTime: `${day}T${endTime}:00`, timeZone: TIMEZONE };
    } else {
      const next = new Date(ev.date);
      next.setUTCDate(next.getUTCDate() + 1);
      body.start = { date: day };
      body.end = { date: ymd(next) }; // 종일 일정의 DTEND는 익일
    }

    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as { id: string };
  }

  /** id_token(JWT) 페이로드에서 이메일만 추출 — 서명은 구글이 방금 준 응답이라 신뢰. */
  private emailFromIdToken(idToken?: string): string | null {
    if (!idToken) return null;
    try {
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as {
        email?: string;
      };
      return payload.email ?? null;
    } catch {
      return null;
    }
  }
}

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${pad((h + 1) % 24)}:${pad(m)}`;
}
