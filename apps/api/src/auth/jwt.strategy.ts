import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthPrincipal } from '@tongin/shared';
import { AuthService, type JwtPayload } from './auth.service';
import { JWT_SECRET } from './jwt.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    const principal = await this.authService.buildPrincipal(payload.sub);
    if (!principal) throw new UnauthorizedException('유효하지 않은 토큰 주체입니다.');
    return principal;
  }
}
