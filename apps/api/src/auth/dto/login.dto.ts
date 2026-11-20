import { Matches, IsString, MaxLength, MinLength } from 'class-validator';
import type { LoginRequest } from '@tongin/shared';

export class LoginDto implements LoginRequest {
  @IsString()
  @MaxLength(100)
  loginId!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(200)
  password!: string;
}

/** 내 비밀번호 바꾸기 — 새 비밀번호 규칙은 계정 만들 때와 같다(6~100자) */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  /** 8자 이상, 영문·숫자를 모두 넣는다(화면의 '가능' 기준과 같다) */
  @IsString()
  @MinLength(8, { message: '새 비밀번호는 8자 이상이어야 합니다.' })
  @MaxLength(100)
  @Matches(/[A-Za-z]/, { message: '새 비밀번호에 영문을 넣어 주세요.' })
  @Matches(/[0-9]/, { message: '새 비밀번호에 숫자를 넣어 주세요.' })
  newPassword!: string;
}

export class VerifyPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
