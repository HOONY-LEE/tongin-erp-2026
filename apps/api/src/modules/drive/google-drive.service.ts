import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DRIVE_FILE_MAX_BYTES, type AuthPrincipal, type GoogleDriveFile } from '@tongin/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JWT_SECRET } from '../../auth/jwt.constants';
import { DriveService } from './drive.service';

const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
/** 내 구글 드라이브 보기·받기 + 이 앱이 올린 파일 쓰기 + 계정 이메일 */
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
].join(' ');
const STATE_TTL_MS = 10 * 60 * 1000;
/** state 끝에 붙여 캘린더 연결과 가른다(리디렉션 주소는 캘린더와 같은 것을 쓴다 — 구글 콘솔에 새로 등록하지 않게) */
const STATE_PURPOSE = 'drive';
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,iconLink,webViewLink';

/** 구글 문서류는 그대로 못 받으니 오피스 파일로 바꿔 받는다 */
const EXPORTS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: '.pptx',
  },
  'application/vnd.google-apps.drawing': { mime: 'application/pdf', ext: '.pdf' },
};

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}
interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
  webViewLink?: string;
}

const sign = (payload: string) =>
  createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');

/** 구글이 돌려준 state가 드라이브 연결 것인지(캘린더 콜백에서 갈라 부른다) */
export function isDriveState(state: string | undefined): boolean {
  const [encoded] = (state ?? '').split('.');
  if (!encoded) return false;
  try {
    return Buffer.from(encoded, 'base64url').toString().endsWith(`.${STATE_PURPOSE}`);
  } catch {
    return false;
  }
}

/**
 * 구글 드라이브 연동 — 사람마다 자기 구글 계정을 연결해
 *  내 구글 드라이브 둘러보기·검색, 드라이브로 가져오기(복사), 링크로 넣기, 드라이브 파일을 구글로 보내기.
 * OAuth 클라이언트는 캘린더와 같은 GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.
 * 구글 클라우드 콘솔에서 Google Drive API를 켜고, 동의 화면에 drive.readonly·drive.file 범위를 더해야 한다.
 */
@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger('GoogleDrive');

  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: DriveService,
  ) {}

  get configured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  private get redirectUri() {
    return process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/calendar/google/callback';
  }

  private assertConfigured() {
    if (!this.configured)
      throw new BadRequestException(
        '구글 연동이 설정되지 않았습니다. 관리자에게 문의하세요(GOOGLE_CLIENT_ID/SECRET 필요).',
      );
  }

  async status(p: AuthPrincipal) {
    const link = await this.prisma.googleDriveLink.findUnique({ where: { userId: p.userId } });
    return {
      configured: this.configured,
      connected: !!link,
      googleEmail: link?.googleEmail ?? null,
    };
  }

  authUrl(p: AuthPrincipal) {
    this.assertConfigured();
    const payload = `${p.userId}.${Date.now() + STATE_TTL_MS}.${STATE_PURPOSE}`;
    const state = `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return { url: `${OAUTH_AUTH_URL}?${params.toString()}` };
  }

  async handleCallback(code: string, state: string) {
    this.assertConfigured();
    const [encoded, sig] = (state ?? '').split('.');
    const payload = Buffer.from(encoded ?? '', 'base64url').toString();
    const a = Buffer.from(sig ?? '');
    const b = Buffer.from(sign(payload));
    if (!sig || a.length !== b.length || !timingSafeEqual(a, b))
      throw new BadRequestException('인증 요청 검증에 실패했습니다.');
    const [userId, exp] = payload.split('.');
    if (!userId || Number(exp) < Date.now())
      throw new BadRequestException('인증 요청이 만료되었습니다. 다시 시도하세요.');

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new BadRequestException(`구글 토큰 교환 실패: ${await res.text()}`);
    const t = (await res.json()) as TokenResponse;
    if (!t.scope?.includes('drive'))
      throw new BadRequestException(
        '구글 드라이브 접근을 허용하지 않았습니다. 다시 연결하며 허용해 주세요.',
      );
    const googleEmail = emailFromIdToken(t.id_token) ?? 'unknown';
    const data = {
      googleEmail,
      accessToken: t.access_token,
      tokenExpiry: new Date(Date.now() + t.expires_in * 1000),
      scope: t.scope ?? null,
    };
    await this.prisma.googleDriveLink.upsert({
      where: { userId },
      create: { userId, ...data, refreshToken: t.refresh_token ?? null },
      update: { ...data, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}) },
    });
    return { googleEmail };
  }

  async disconnect(p: AuthPrincipal) {
    const link = await this.prisma.googleDriveLink.findUnique({ where: { userId: p.userId } });
    if (!link) return;
    // 구글 쪽 권한도 거둔다(실패해도 연결은 끊는다)
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.refreshToken ?? link.accessToken)}`,
      {
        method: 'POST',
      },
    ).catch(() => undefined);
    await this.prisma.googleDriveLink.delete({ where: { userId: p.userId } });
  }

  private async token(userId: string): Promise<string> {
    const link = await this.prisma.googleDriveLink.findUnique({ where: { userId } });
    if (!link) throw new BadRequestException('구글 드라이브를 먼저 연결해 주세요.');
    if (link.tokenExpiry && link.tokenExpiry.getTime() > Date.now() + 60_000)
      return link.accessToken;
    if (!link.refreshToken)
      throw new BadRequestException(
        '구글 인증이 만료되었습니다. 구글 드라이브를 다시 연결해 주세요.',
      );
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
        refresh_token: link.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok)
      throw new BadRequestException(
        '구글 인증 갱신에 실패했습니다. 구글 드라이브를 다시 연결해 주세요.',
      );
    const t = (await res.json()) as TokenResponse;
    await this.prisma.googleDriveLink.update({
      where: { userId },
      data: {
        accessToken: t.access_token,
        tokenExpiry: new Date(Date.now() + t.expires_in * 1000),
      },
    });
    return t.access_token;
  }

  private async call(userId: string, url: string, init: RequestInit = {}) {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await this.token(userId)}` },
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`구글 드라이브 ${res.status}: ${text.slice(0, 300)}`);
      if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(text))
        throw new BadRequestException(
          '구글 클라우드 콘솔에서 Google Drive API가 꺼져 있습니다. 관리자에게 켜 달라고 요청하세요.',
        );
      if (res.status === 404)
        throw new BadRequestException('구글 드라이브에서 파일을 찾지 못했습니다.');
      throw new BadRequestException(`구글 드라이브 오류(${res.status})`);
    }
    return res;
  }

  /** 폴더 안(기본 '내 드라이브' 맨 위) 또는 검색, 또는 '공유 문서함' */
  async list(
    p: AuthPrincipal,
    opts: { folderId?: string; q?: string; view?: string; pageToken?: string },
  ) {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = opts.q?.trim()
      ? `name contains '${esc(opts.q.trim().slice(0, 100))}' and trashed = false`
      : opts.view === 'shared'
        ? 'sharedWithMe = true and trashed = false'
        : `'${esc(opts.folderId || 'root')}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '100',
      orderBy: opts.q ? 'modifiedTime desc' : 'folder,name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    });
    const res = await this.call(p.userId, `${DRIVE_API}/files?${params.toString()}`);
    const body = (await res.json()) as { files: RawFile[]; nextPageToken?: string };
    return {
      files: body.files.map(toView),
      nextPageToken: body.nextPageToken ?? null,
    };
  }

  private async meta(userId: string, fileId: string): Promise<RawFile> {
    const res = await this.call(
      userId,
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}&supportsAllDrives=true`,
    );
    return (await res.json()) as RawFile;
  }

  /** 구글 파일을 드라이브로 복사해 온다(구글 문서류는 오피스 파일로) */
  async importFile(p: AuthPrincipal, fileId: string, spaceId: string, parentId: string | null) {
    const f = await this.meta(p.userId, fileId);
    if (f.mimeType === 'application/vnd.google-apps.folder')
      throw new BadRequestException('폴더는 가져올 수 없습니다. 파일을 골라 주세요.');
    const exp = EXPORTS[f.mimeType];
    if (!exp && f.mimeType.startsWith('application/vnd.google-apps.'))
      throw new BadRequestException('이 구글 파일 종류는 가져올 수 없습니다. 링크로 넣어 주세요.');
    if (!exp && Number(f.size ?? 0) > DRIVE_FILE_MAX_BYTES)
      throw new BadRequestException(
        `${DRIVE_FILE_MAX_BYTES / 1024 / 1024}MB보다 큰 파일은 가져올 수 없습니다. 링크로 넣어 주세요.`,
      );
    const url = exp
      ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exp.mime)}`
      : `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    const res = await this.call(p.userId, url);
    const bytes = Buffer.from(await res.arrayBuffer());
    const name = exp && !f.name.toLowerCase().endsWith(exp.ext) ? `${f.name}${exp.ext}` : f.name;
    return this.drive.upload(p, spaceId, parentId, name, exp?.mime ?? f.mimeType, bytes);
  }

  /** 복사하지 않고 링크로 넣는다(큰 파일·구글 문서 그대로 쓰기) */
  async linkFile(p: AuthPrincipal, fileId: string, spaceId: string, parentId: string | null) {
    const f = await this.meta(p.userId, fileId);
    if (!f.webViewLink) throw new BadRequestException('이 파일은 링크를 만들 수 없습니다.');
    return this.drive.createLink(p, spaceId, parentId, {
      name: f.name,
      url: f.webViewLink,
      mimeType: f.mimeType,
      googleFileId: f.id,
    });
  }

  /** 드라이브 파일을 내 구글 드라이브(맨 위)로 보낸다 */
  async sendToGoogle(p: AuthPrincipal, itemId: string) {
    const file = await this.drive.content(itemId, p);
    const boundary = `tongin${Date.now().toString(36)}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: file.name })}\r\n` +
        `--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const res = await this.call(
      p.userId,
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: Buffer.concat([head, Buffer.from(file.bytes), tail]),
      },
    );
    const body = (await res.json()) as { id: string; webViewLink?: string };
    return { googleFileId: body.id, webViewLink: body.webViewLink ?? null };
  }
}

function toView(f: RawFile): GoogleDriveFile {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    size: f.size != null ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
    iconLink: f.iconLink ?? null,
    webViewLink: f.webViewLink ?? null,
  };
}

function emailFromIdToken(idToken?: string): string | null {
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
