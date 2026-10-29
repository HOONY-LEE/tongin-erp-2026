import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthPrincipal, LoginResponse } from '@tongin/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';
import { LoginThrottlerGuard } from './login-throttler.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // 같은 IP·아이디로 1분에 10번 넘게 시도하면 429
  @UseGuards(LoginThrottlerGuard)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  /** 현재 인증된 주체(권한·스코프 포함). 가드가 이미 검증했으므로 그대로 반환. */
  @Get('me')
  me(@CurrentUser() user: AuthPrincipal): AuthPrincipal {
    return user;
  }

  /** 내 비밀번호 바꾸기(내 계정) */
  @Post('password')
  @HttpCode(200)
  @UseGuards(LoginThrottlerGuard)
  changePassword(@CurrentUser() user: AuthPrincipal, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }
}
