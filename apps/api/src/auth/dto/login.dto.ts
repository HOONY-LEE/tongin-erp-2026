import { IsString, MaxLength, MinLength } from 'class-validator';
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

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword!: string;
}
