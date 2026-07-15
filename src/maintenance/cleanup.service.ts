import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface CleanupResult {
  refreshTokens: number;
  passwordResetTokens: number;
  invitations: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('17 3 * * *')
  async handleDailyCleanup(): Promise<void> {
    const result = await this.cleanup();
    this.logger.log(
      `Cleanup: removed ${result.refreshTokens} refresh tokens, ` +
        `${result.passwordResetTokens} reset tokens, ${result.invitations} stale invitations`,
    );
  }

  /**
   * Expired refresh tokens go immediately; revoked ones and expired
   * reset tokens / unaccepted invitations are kept 30 days for forensics.
   */
  async cleanup(): Promise<CleanupResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

    const [refreshTokens, passwordResetTokens, invitations] = await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: thirtyDaysAgo } }],
        },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: thirtyDaysAgo } }, { usedAt: { lt: thirtyDaysAgo } }],
        },
      }),
      this.prisma.invitation.deleteMany({
        where: { acceptedAt: null, expiresAt: { lt: thirtyDaysAgo } },
      }),
    ]);

    return {
      refreshTokens: refreshTokens.count,
      passwordResetTokens: passwordResetTokens.count,
      invitations: invitations.count,
    };
  }
}
