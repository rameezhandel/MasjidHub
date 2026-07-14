import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { MasjidStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../interfaces/auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Re-validates the principal on every request so that deactivated users and
   * suspended masjids are locked out immediately, not when their token expires.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { masjid: { select: { status: true } } },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    if (user.masjid && user.masjid.status !== MasjidStatus.ACTIVE) {
      throw new UnauthorizedException('Masjid is not active');
    }
    return { id: user.id, email: user.email, role: user.role, masjidId: user.masjidId };
  }
}
