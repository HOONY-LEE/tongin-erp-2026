import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@tongin/shared';

/** 라우트 접근에 필요한 권한(모두 충족, AND). 권한=데이터 — 코드엔 코드만 선언. */
export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
