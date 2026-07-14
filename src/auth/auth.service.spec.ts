import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let passwordHash: string;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mailService = { sendPasswordResetEmail: jest.fn() };

  const baseUser = () => ({
    id: 'user-1',
    email: 'admin@test.local',
    passwordHash,
    firstName: 'Test',
    lastName: 'User',
    role: UserRole.PLATFORM_ADMIN,
    isActive: true,
    masjidId: null,
    masjid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeAll(async () => {
    passwordHash = await AuthService.hashPassword('correct-password');
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('jwt-token') } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, unknown> = {
                JWT_ACCESS_TTL_SECONDS: 900,
                JWT_REFRESH_TTL_SECONDS: 604800,
                PASSWORD_RESET_TTL_MINUTES: 60,
                APP_BASE_URL: 'http://localhost:3000',
              };
              return values[key];
            }),
          },
        },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
    await service.onModuleInit();
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'ADMIN@test.local',
        password: 'correct-password',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBeTruthy();
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'admin@test.local' } }),
      );
      const stored = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).not.toBe(result.refreshToken);
    });

    it('rejects unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@test.local', password: 'whatever-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      await expect(
        service.login({ email: 'admin@test.local', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects deactivated users', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser(), isActive: false });
      await expect(
        service.login({ email: 'admin@test.local', password: 'correct-password' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects users of a suspended masjid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser(),
        role: UserRole.MASJID_ADMIN,
        masjidId: 'masjid-1',
        masjid: { id: 'masjid-1', status: MasjidStatus.SUSPENDED },
      });
      await expect(
        service.login({ email: 'admin@test.local', password: 'correct-password' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser(),
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('some-refresh-token');

      expect(result.accessToken).toBe('jwt-token');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt-1' } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('bogus')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes all sessions when a rotated token is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser(),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.refresh('reused-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: baseUser(),
      });
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('is silent for unknown emails and sends nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.forgotPassword('nobody@test.local');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('is silent for deactivated users', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser(), isActive: false });
      await service.forgotPassword('admin@test.local');
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('stores only a hash and emails a link containing the raw token', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      prisma.$transaction.mockResolvedValue([]);

      await service.forgotPassword('ADMIN@test.local');

      const created = prisma.passwordResetToken.create.mock.calls[0][0].data;
      const [to, resetUrl] = mailService.sendPasswordResetEmail.mock.calls[0];
      expect(to).toBe('admin@test.local');
      expect(resetUrl).toContain('http://localhost:3000/reset-password?token=');
      const rawToken = (resetUrl as string).split('token=')[1];
      expect(created.tokenHash).not.toBe(rawToken);
      expect(created.tokenHash).toBe(AuthService.hashToken(rawToken));
      // previous tokens for the user are invalidated
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rejects unknown tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('bogus', 'a-new-long-password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects used tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser(),
      });
      await expect(service.resetPassword('used', 'a-new-long-password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects expired tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: baseUser(),
      });
      await expect(service.resetPassword('expired', 'a-new-long-password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('updates the password, consumes the token, and revokes sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser(),
      });
      prisma.$transaction.mockResolvedValue([]);

      await service.resetPassword('valid-token', 'a-new-long-password');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prt-1' } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
    });
  });
});
