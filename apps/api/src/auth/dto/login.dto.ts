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
