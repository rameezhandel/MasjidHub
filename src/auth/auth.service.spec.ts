import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
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
    $transaction: jest.fn(),
  };

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
            get: jest.fn((key: string) =>
              key === 'JWT_ACCESS_TTL_SECONDS'
                ? 900
                : key === 'JWT_REFRESH_TTL_SECONDS'
                  ? 604800
                  : undefined,
            ),
          },
        },
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
});
