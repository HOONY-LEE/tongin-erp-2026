import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS, type Permission } from '@tongin/shared';

/** 라우트 접근에 필요한 권한(모두 충족, AND). 권한=데이터 — 코드엔 코드만 선언. */
export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const RequirePermissions = (...permissions: Permission[]) => {
  // 권한 코드는 PERMISSION_CATALOG에서 펼친 문자열이라 타입으로는 오타를 못 잡는다 —
  // 데코레이터가 붙는 순간(서버 부팅) 바로 실패시켜 숨은 오타가 운영까지 가지 않게 한다.
  const unknown = permissions.filter((p) => !PERMISSIONS.includes(p));
  if (unknown.length) throw new Error(`알 수 없는 권한 코드: ${unknown.join(', ')}`);
  return SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
};
