import { SetMetadata } from '@nestjs/common';

/** 전역 인증 가드를 건너뛰는 라우트(로그인·헬스체크 등)에 표시. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
