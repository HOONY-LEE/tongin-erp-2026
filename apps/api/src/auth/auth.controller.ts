import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AuthPrincipal, LoginResponse } from '@tongin/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  /** 현재 인증된 주체(권한·스코프 포함). 가드가 이미 검증했으므로 그대로 반환. */
  @Get('me')
  me(@CurrentUser() user: AuthPrincipal): AuthPrincipal {
    return user;
  }
}
