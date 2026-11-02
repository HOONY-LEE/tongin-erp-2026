// 드라이브 — 구글 드라이브처럼 내 드라이브·조직 드라이브·공유 드라이브에 폴더·파일을 둔다(화면·서버 공용)

/** 공간 종류 — 내 드라이브(본인만) · 조직 드라이브(그 조직과 하위 조직 사람) · 공유 드라이브(구성원) */
export const DRIVE_SPACE_KIND = {
  PERSONAL: '내 드라이브',
  ORG: '조직 드라이브',
  SHARED: '공유 드라이브',
} as const;
export type DriveSpaceKind = keyof typeof DRIVE_SPACE_KIND;

/** 권한 — 관리자(구성원·이름 관리) > 편집자(올리기·고치기·지우기) > 뷰어(보기·받기) */
export const DRIVE_ROLE = { MANAGER: '관리자', EDITOR: '편집자', VIEWER: '뷰어' } as const;
export type DriveRole = keyof typeof DRIVE_ROLE;
export const DRIVE_ROLE_RANK: Record<DriveRole, number> = { VIEWER: 1, EDITOR: 2, MANAGER: 3 };

/** 항목 — 폴더 · 파일(드라이브에 올린 것) · 링크(구글 드라이브 파일을 가리킴) */
export type DriveItemKind = 'FOLDER' | 'FILE' | 'LINK';

/** 파일 하나 최대 크기 — DB에 두므로 크게 잡지 않는다(큰 파일은 구글 드라이브 링크로) */
export const DRIVE_FILE_MAX_BYTES = 25 * 1024 * 1024;
/** 공간별 용량 */
export const DRIVE_QUOTA_BYTES: Record<DriveSpaceKind, number> = {
  PERSONAL: 500 * 1024 * 1024,
  ORG: 2 * 1024 * 1024 * 1024,
  SHARED: 2 * 1024 * 1024 * 1024,
};
/** 휴지통 보관 — 지나면 영구 삭제 */
export const DRIVE_TRASH_DAYS = 30;
export const DRIVE_NAME_MAX = 200;

export interface DriveSpaceView {
  id: string;
  kind: DriveSpaceKind;
  name: string;
  description: string | null;
  role: DriveRole;
  usedBytes: number;
  quotaBytes: number;
  memberCount: number;
}

export interface DriveItemView {
  id: string;
  spaceId: string;
  spaceName: string;
  spaceKind: DriveSpaceKind;
  parentId: string | null;
  kind: DriveItemKind;
  name: string;
  mimeType: string | null;
  size: number | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  starred: boolean;
  shared: boolean;
  trashedAt: string | null;
  /** 이 항목에 대한 내 권한 */
  role: DriveRole;
}

export interface DriveShareView {
  employeeId: string;
  name: string;
  positionName: string | null;
  orgUnitName: string | null;
  role: DriveRole;
}

/** 구글 드라이브 파일(목록용) */
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: string | null;
  iconLink: string | null;
  webViewLink: string | null;
}

/** 파일 크기 글자(1.2MB) */
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
