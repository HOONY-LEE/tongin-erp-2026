import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService, TOKEN_TTL_SECONDS } from './auth.service';
import { JWT_SECRET } from './jwt.constants';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthSeederService } from './seeder.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: TOKEN_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthSeederService,
    // 전역 가드: 인증(JWT) → 권한(RBAC) 순서. @Public()·@RequirePermissions()로 라우트별 제어.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  // 에이전트 예약 실행이 만든 사람 권한으로 돌 때 주체·토큰을 만든다
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
