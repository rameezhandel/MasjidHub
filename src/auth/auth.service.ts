import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Masjid, MasjidStatus, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { SafeUser, toSafeUser } from '../common/utils/safe-user';
import { Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  user: SafeUser;
}

type UserWithMasjid = User & { masjid: Masjid | null };

@Injectable()
export class AuthService implements OnModuleInit {
  /** Verified against when the email is unknown, to keep login timing uniform. */
  private dummyPasswordHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await AuthService.hashPassword(randomBytes(16).toString('hex'));
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { masjid: true },
    });

    const passwordHash = user?.passwordHash ?? this.dummyPasswordHash;
    const passwordValid = await argon2.verify(passwordHash, dto.password).catch(() => false);
    if (!user || !passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    this.assertUserMayAuthenticate(user);

    // Housekeeping: drop this user's expired refresh tokens.
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = AuthService.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { masjid: true } } },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      // Reuse of a rotated/revoked token — assume compromise and revoke all sessions.
      await this.revokeAllSessions(record.userId);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    this.assertUserMayAuthenticate(record.user);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user);
  }

  /** Idempotent: revokes the token if it belongs to the user and is still active. */
  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = AuthService.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const currentValid = await argon2
      .verify(user.passwordHash, dto.currentPassword)
      .catch(() => false);
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await AuthService.hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Always succeeds silently — never reveals whether the email exists.
   * Requesting a new reset invalidates any previous outstanding token.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { masjid: true },
    });
    if (!user || !user.isActive) {
      return;
    }
    if (user.masjid && user.masjid.status !== MasjidStatus.ACTIVE) {
      return;
    }

    const token = randomBytes(48).toString('base64url');
    const ttlMinutes = this.configService.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    await this.prisma.$transaction([
      // One outstanding token per user; also purge anything already expired.
      this.prisma.passwordResetToken.deleteMany({
        where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash: AuthService.hashToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
        },
      }),
    ]);

    const baseUrl = this.configService.get('APP_BASE_URL', { infer: true });
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    await this.mailService.sendPasswordResetEmail(user.email, resetUrl, ttlMinutes);
  }

  /** Single-use: consuming the token revokes it and every session of the user. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: AuthService.hashToken(token) },
      include: { user: { include: { masjid: true } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    this.assertUserMayAuthenticate(record.user);

    const passwordHash = await AuthService.hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getProfile(userId: string): Promise<SafeUser & { masjid: Masjid | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { masjid: true },
    });
    return { ...toSafeUser(user), masjid: user.masjid };
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private assertUserMayAuthenticate(user: UserWithMasjid): void {
    if (!user.isActive) {
      throw new ForbiddenException('This account is disabled');
    }
    if (user.masjid && user.masjid.status !== MasjidStatus.ACTIVE) {
      throw new ForbiddenException(`This masjid is ${user.masjid.status.toLowerCase()}`);
    }
  }

  private async issueTokens(user: UserWithMasjid): Promise<AuthTokens> {
    const accessTtl = this.configService.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const refreshTtl = this.configService.get('JWT_REFRESH_TTL_SECONDS', { infer: true });

    const accessToken = await this.jwtService.signAsync(
      { email: user.email, role: user.role, masjidId: user.masjidId },
      { subject: user.id, expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: AuthService.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: accessTtl,
      refreshToken,
      user: toSafeUser(user),
    };
  }
}
